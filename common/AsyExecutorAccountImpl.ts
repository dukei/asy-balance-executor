import Account, {AccountType} from "../models/Account";
import log from "./log";
import AsyBalanceDBStorageImpl from "../app/api/AsyBalanceDBStorageImpl";
import Execution, {ExecutionStatus} from "../models/Execution";
import {
    AsyBalancePreferences,
    AsyBalanceProvider,
    AsyBalanceResult,
    AsyBalanceResultError,
    AsyBalanceResultSuccess
} from "asy-balance-core";

import SingleInit from "./SingleInit";
import {AsyTaskStatus, AsyTaskStatuses, AsyTaskStatusImpl} from "./AsyTaskStatus";
import {AsyQueuedTask, AsyQueuedTaskImpl} from "./AsyQueuedTask";
import QueuedExecution from "../models/QueuedExecution";
import {Transaction} from "sequelize";
import {AsyBalanceExecutor, AsyExecutorProvider} from "../index";
import AccountTask from "../models/AccountTask";

const PASSWORD_PLACEHOLDER = "\x01\x02\x03";

export type AsyExecutorAccountUpdateParams = {
    name?: string
    prefs?: AsyBalancePreferences
    active?: boolean
}

export type AsyExecuteParams = {
    task?: string
    outer?: object
    forceExecute?: boolean //Запускать даже если уже запущена задача
    returnWhenLaunched?: boolean //Вернуться из функции, когда аккаунт перейдет в инпрогресс
}

export type AsyQueuedTaskPreferences = {
    id: string,
    [name: string]: any
}

export interface AsyExecutorAccount {
    readonly id: number
    readonly providerId: number
    readonly userId: string
    readonly name: string
    readonly prefs: Promise<AsyBalancePreferences>
    readonly active: boolean
    readonly createdAt: Date
    readonly updatedAt: Date
    readonly tasks: Promise<AsyTaskStatuses>
    readonly provider: Promise<AsyExecutorProvider>
    readonly type: AccountType

    execute(params?: AsyExecuteParams): Promise<AsyBalanceResult[]>;
    startExecution(params?: AsyExecuteParams): Promise<AsyTaskStatus>;
    update(fields: AsyExecutorAccountUpdateParams): Promise<void>;
    delete(): Promise<void>;
    createQueuedTask(prefs: AsyQueuedTaskPreferences, task?: string): Promise<AsyQueuedTask>;
    getPreferences(): AsyBalancePreferences;
}

export class AsyExecutorAccountImpl implements AsyExecutorAccount {
    private accId: number;
    private acc: SingleInit<Account>;

    constructor(acc: number|Account) {
        if(typeof(acc) === 'number') {
            this.accId = acc;
            this.acc = new SingleInit<Account>();
        }else{
            this.accId = acc.id;
            this.acc = new SingleInit<Account>({value: acc});
        }
    }

    public get id(): number { return this.acc.value?.id };
    public get providerId(): number { return this.acc.value?.providerId!};
    public get userId(): string { return this.acc.value?.userId || ""};
    public get name(): string { return this.acc.value?.name || "" };
    public get active(): boolean { return this.acc.value?.active || false };
    public get createdAt(): Date { return this.acc.value?.createdAt! };
    public get updatedAt(): Date { return this.acc.value?.updatedAt! };
    public get type(): AccountType { return this.acc.value?.type! };

    public get tasks(): Promise<AsyTaskStatuses> {
        return (async () => {
            const acc = await this.getAccount();
            const tasks = await acc.tasks;
            const dict: AsyTaskStatuses = {};
            for(let t of tasks){
                dict[t.task] = new AsyTaskStatusImpl(t);
            }
            return dict;
        })();
    }

    public get provider(): Promise<AsyExecutorProvider> {
        return this.getProvider();
    }

    public get providerBundle(): Promise<AsyBalanceProvider> {
        return this.getProviderBundle();
    }

    public get prefs(): Promise<AsyBalancePreferences> {
        return (async () => {
            const prov = await this.getProviderBundle();
            const maskedPrefs = await prov.getMaskedPreferences();
            let prefs: AsyBalancePreferences = this.getPreferences();
            for(let p of maskedPrefs){
                if(prefs[p])
                    prefs[p] = PASSWORD_PLACEHOLDER;
            }
            return prefs;
        })();
    }

    public async getAccount(): Promise<Account> {
        const acc = await this.acc.get({
            getT: async () => {
                const acc = await Account.findOne({where: {id: this.accId}});
                if (!acc)
                    throw new Error('Account not found!');
                if (!this.accId)
                    this.accId = acc.id;

                return acc;
            },
        });
        return acc;
    }

    private async getProviderBundle(): Promise<AsyBalanceProvider> {
        const prov = await this.getProvider();
        return prov.provBundle;
    }

    private async getProvider(): Promise<AsyExecutorProvider> {
        const acc = await this.getAccount();
        return AsyExecutorProvider.get(acc.providerId);
    }

    public getPreferences(): AsyBalancePreferences {
        const prefs = this.acc.value?.prefs;
        return prefs ? JSON.parse(prefs) : {}
    }

    private async __createExecution(params: AsyExecuteParams): Promise<Execution>{
        log.info('About to execute account ' + this.accId);

        const acc = await this.getAccount();
        const prov = await this.provider;

        const prefs = this.getPreferences();
        prefs.proxy = acc.proxy || undefined;
        prefs.__task = params.task;
        const taskName = params.task || '';

        const sequelize = (await AsyBalanceExecutor.getInstance()).sequelize;

        let execOrNot = await sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        }, async () => {
            const accTask = await AccountTask.findOne({where: {accountId: acc.id, task: taskName}});
            if (accTask?.lastStatus === ExecutionStatus.INPROGRESS)
                log.info(`Account ${acc.id} (${prov.id}, task: ${params.task}) is already INPROGRESS`);

            if (params.forceExecute || accTask?.lastStatus !== ExecutionStatus.INPROGRESS){
                const exec = Execution.build({
                    task: params.task,
                    status: ExecutionStatus.INPROGRESS,
                    prefs: JSON.stringify(prefs, null, '  '),
                    accountId: acc.id
                });

                await exec.save();
                return exec;
            }
        });

        if(!execOrNot)
            throw new Error("Task is already in progress");

        return execOrNot;
    }

    public async startExecution(params: AsyExecuteParams = {}): Promise<AsyTaskStatus>{
        const exec = await this.__createExecution(params);
        this.__executeProvider(params, exec).catch(e => log.error(e));

        const task = await AccountTask.findOne({where: {accountId: exec.accountId, task: exec.task || ''}});
        return new AsyTaskStatusImpl(task!);
    }

    private async __executeProvider(params: AsyExecuteParams, exec: Execution): Promise<AsyBalanceResult[]>{
        const acc = await this.getAccount();
        const prov = await this.provider;

        let stimpl = new AsyBalanceDBStorageImpl(exec, acc);

        log.info('Starting account ' + this.accId + '(task: ' + params.task + ') provider ' + prov.textId);
        let result: AsyBalanceResult[] = [];

        const prefs = exec.getPrefs();

        try {
            result = await prov.provBundle.execute({
                task: params.task,
                accId: '' + this.accId,
                preferences: prefs,
                apiTrace: stimpl,
                apiStorage: stimpl,
                apiResult: stimpl,
                apiRetrieve: stimpl,
                proxy: prefs.proxy,
                outer: params.outer
            });

            exec.status = Execution.getStatusFromResult(result);
            log.info("Account " + this.accId + " finished successfully with status " + exec.status);
        }catch(e: any){
            log.error("Account " + this.accId + " execution error (execId:" + exec.id + "): " + e.stack);

            exec.status = ExecutionStatus.ERROR;
            const res: AsyBalanceResultError = {
                error: true,
                e: e as Error,
                message: e.message
            };

            result.push(res);

            await stimpl.setResult(res);
        }

        exec.finishedAt = new Date();
        await exec.save();
        await exec.reload();

        return JSON.parse(exec.result);

    }

    public async execute(params: AsyExecuteParams = {}): Promise<AsyBalanceResult[]>{
        const exec = await this.__createExecution(params);
        return this.__executeProvider(params, exec);
    }

    public async update(fields: AsyExecutorAccountUpdateParams): Promise<void> {
        const acc = await this.getAccount();

        if(fields.name)
            acc.name = fields.name;
        if(fields.prefs){
            const prov = await this.getProviderBundle();
            const masked = await prov.getMaskedPreferences();
            const prefs = this.getPreferences();
            let prefsTo = fields.prefs;
            if(masked.length !== 0){
                const _p: AsyBalancePreferences = {};
                for(let p in prefsTo){
                    if(masked.indexOf(p) >= 0 && prefsTo[p] === PASSWORD_PLACEHOLDER){
                        _p[p] = prefs[p];
                    }else{
                        _p[p] = prefsTo[p];
                    }
                }
                prefsTo = _p;
            }
            acc.prefs = JSON.stringify(prefsTo);
        }
        if(fields.active !== undefined)
            acc.active = fields.active;

        await acc.save();
    }

    public async delete(): Promise<void> {
        const acc = await this.getAccount();
        await acc.destroy();
    }

    public async createQueuedTask(prefsTask: AsyQueuedTaskPreferences, task?: string): Promise<AsyQueuedTask>{
        const prefs = this.getPreferences();
        let qe: QueuedExecution;
        const sequelize = (await AsyBalanceExecutor.getInstance()).sequelize;

        await sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        }, async () => {
            const e = await Execution.create({
                status: ExecutionStatus.INQUEUE,
                prefs: JSON.stringify({
                    common: prefs,
                    task: prefsTask
                }),
                accountId: this.accId,
                task: task
            });

            qe = await QueuedExecution.create({
                accountId: this.accId,
                executionId: e.id
            });
            qe.execution = e;
        });

        const acc = await this.getAccount();
        return new AsyQueuedTaskImpl(qe!, acc, await AsyExecutorProvider.get(acc.providerId));
    }
}