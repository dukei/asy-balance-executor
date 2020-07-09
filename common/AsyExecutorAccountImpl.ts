import Account from "../models/Account";
import Provider from "../models/Provider";
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

const PASSWORD_PLACEHOLDER = "\x01\x02\x03";

export type AsyExecutorAccountUpdateParams = {
    name?: string
    prefs?: AsyBalancePreferences
    active?: boolean
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
    readonly provider: Promise<AsyBalanceProvider>

    execute(task?: string): Promise<AsyBalanceResult[]>;
    update(fields: AsyExecutorAccountUpdateParams): Promise<void>;
    delete(): Promise<void>;
}

export class AsyExecutorAccountImpl implements AsyExecutorAccount {
    private accId: number;
    private prov: SingleInit<AsyBalanceProvider> = new SingleInit<AsyBalanceProvider>();
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

    public get provider(): Promise<AsyBalanceProvider> {
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
            getT: () => Account.findOne({include: [Provider], where: {id: this.accId}}),
            initT: (acc) => {
                if (!acc)
                    throw new Error('Account not found!');
                if (!this.accId)
                    this.accId = acc.id;

                return acc;
            }
        });
        return acc;
    }

    private async getProviderBundle(): Promise<AsyBalanceProvider> {
        const prov = await this.prov.get({getT: async () => {
            let acc = await this.getAccount();
            let pb = await AsyBalanceProvider.create(acc.provider.data);
            return pb;
        }});

        return prov;
    }

    private getPreferences(): AsyBalancePreferences {
        const prefs = this.acc.value?.prefs;
        return prefs ? JSON.parse(prefs) : {}
    }

    public async execute(task?: string): Promise<AsyBalanceResult[]>{
        log.info('About to execute account ' + this.accId);

        const [prov, acc] = await Promise.all([
            this.getProviderBundle(),
            this.getAccount()
        ]);

        const prefs = this.getPreferences();
        prefs.proxy = acc.proxy || undefined;
        prefs.__task = task;

        let exec = Execution.build({
            task: task,
            status: ExecutionStatus.INPROGRESS,
            prefs: JSON.stringify(prefs, null, '  '),
            accountId: acc.id
        });

        await exec.save();

        let stimpl = new AsyBalanceDBStorageImpl(exec, acc);

        log.info('Starting account ' + this.accId + '(task: ' + task + ') provider ' + acc.provider.type);
        let result: AsyBalanceResult[] = [];

        try {
            result = await prov.execute({
                task: task,
                accId: '' + this.accId,
                preferences: prefs,
                apiTrace: stimpl,
                apiStorage: stimpl,
                apiResult: stimpl,
                apiRetrieve: stimpl,
                proxy: prefs.proxy
            })

            exec.status = this.getStatusFromResult(result);
            log.info("Account " + this.accId + " finished successfully with status " + exec.status);
        }catch(e){
            log.error("Account " + this.accId + " execution error: " + e.stack);

            exec.status = ExecutionStatus.ERROR;
            const res: AsyBalanceResultError = {
                error: true,
                e: e as Error,
                message: '' + e.stack
            };

            result.push(res);

            await stimpl.setResult(res);
        }

        exec.finishedAt = new Date();
        await exec.save();
        await exec.reload();

        return JSON.parse(exec.result);
    }

    private getStatusFromResult(result: AsyBalanceResult[]){
        let hasError = false, hasSuccess = false;
        for(let r of result){
            const rs = r as AsyBalanceResultSuccess;
            if(rs.success)
                hasSuccess = true;
            const re = r as AsyBalanceResultError;
            if(re.error)
                hasError = true;
            if(hasSuccess && hasError)
                break;
        }

        if(hasSuccess && hasError)
            return ExecutionStatus.SUCCESS_PARTIAL;
        if(hasSuccess)
            return ExecutionStatus.SUCCESS;
        return ExecutionStatus.ERROR;
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
}