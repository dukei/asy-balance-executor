import {Sequelize} from "sequelize-typescript";
import AsyBalanceDBStorageImpl from "../app/api/AsyBalanceDBStorageImpl";
import {AsyExecutorAccount, AsyExecutorAccountImpl, AsyExecutorAccountUpdateParams} from "./AsyExecutorAccountImpl";
import Account, {AccountType} from "../models/Account";
import AccountTask from "../models/AccountTask";
import Provider from "../models/Provider";
import SingleInit from "./SingleInit";
import Execution, {ExecutionStatus} from "../models/Execution";
import log from "./log";
import Code from "../models/Code";
import QueuedExecution from "../models/QueuedExecution";
import {Includeable, Op, Transaction} from "sequelize";
import {AsyAccountSavedData, AsyQueuedTask, AsyQueuedTaskImpl} from "./AsyQueuedTask";
import _ from "lodash";
import {v4 as uuid} from "uuid";
import cls from "cls-hooked";
import ExecutionLog from "../models/ExecutionLog";
import {AsyBalanceResult} from "asy-balance-core";
import Merge from "./Merge";

export type AsyBalanceExecutorConfig = {
    connection_string: string
    timezone?: string
    db_logging?: boolean
}

export default class AsyBalanceExecutor{
    private static instance: SingleInit<AsyBalanceExecutor>;
    private static config: AsyBalanceExecutorConfig;

    public readonly sequelize: Sequelize;

    private constructor(config: AsyBalanceExecutorConfig) {
        const logging = config.db_logging || config.db_logging === undefined ? console.log : false;

        const namespace = cls.createNamespace("asy-balance-executor");
        //As of https://github.com/RobinBuschmann/sequelize-typescript/issues/336#issuecomment-375527175
        (Sequelize as any).__proto__.useCLS(namespace);

        this.sequelize =  new Sequelize(config.connection_string, {
            timezone: config.timezone,
            logging: logging,
            define: {
                underscored: true,
                timestamps: false,
            },
            models: [__dirname + '/../models']
        });

    }

    public static setConfig(config: AsyBalanceExecutorConfig){
        AsyBalanceExecutor.config = config;
    }

    public static async getInstance(): Promise<AsyBalanceExecutor>{
        if(!AsyBalanceExecutor.instance){
            const _config = AsyBalanceExecutor.config;
            if(!_config)
                throw new Error('No config specified neither in argument or in setConfig!');

            AsyBalanceExecutor.instance = new SingleInit<AsyBalanceExecutor>({
                getT: async () => {
                    let ase = new AsyBalanceExecutor(_config);
                    await ase.initialize();
                    return ase;
                }
            });
        }

        return AsyBalanceExecutor.instance.get();
    }

    private async initialize(): Promise<void> {
        //Завершаем задачи, которые могли остаться в статусе INPROGRESS
        const tasks = await AccountTask.findAll({include: [Account], where: {
            lastStatus: ExecutionStatus.INPROGRESS,
            "$account.type$": AccountType.SERVER
        }});
        log.info("AsyBalanceExecutor found " + tasks.length + " inprogress tasks. Terminated them");

        if(tasks.length)
            await Code.destroy({
                where: {},
                truncate: true
            });

        let promises: Promise<any>[] = [];
        for(let task of tasks) {
            if (!task.lastResultErrorTime && !task.lastResultSuccessTime){
                promises.push(task.destroy());
            }else{
                let values: { [name: string]: any } = {
                    needCodeTill: null,
                    codeCnt: 0
                };
                if(!task.lastResultSuccessTime){
                    values.lastStatus = ExecutionStatus.ERROR;
                }else if(!task.lastResultErrorTime){
                    values.lastStatus = ExecutionStatus.SUCCESS;
                }else{
                    values.lastStatus =
                            task.lastResultErrorTime.getTime() > task.lastResultSuccessTime.getTime()
                                ? ExecutionStatus.ERROR
                                : ExecutionStatus.SUCCESS;
                }
                promises.push(task.update(values));
            }
        }
        if(promises.length) {
            await Promise.all(promises);
        }
    }

    public async enterCode(codeId: string, code: string): Promise<void>{
        await AsyBalanceDBStorageImpl.resolveCode(codeId, code);
    }

    private async getAccountModels(userId?: string, ids?: number[], type?: AccountType, include?: Includeable[]): Promise<Account[]>{
        const where: {[name: string]: any} = {};
        if(userId)
            where.userId = userId;

        if(ids){
            if(ids.length === 0)
                where.active = 1;
            else
                where.id = ids;
        }

        if(type)
            where.type = type;

        const accs = await Account.findAll({include: include, where: where});
        return accs;
    }

    public async getAccounts(userId?: string, ids?: number[], type?: AccountType): Promise<AsyExecutorAccount[]>{
        const accs = await this.getAccountModels(userId, ids, type, [Provider, AccountTask]);
        return accs.map(acc => new AsyExecutorAccountImpl(acc));
    }

    public async createAccount(providerId: number, userId: string, params: AsyExecutorAccountUpdateParams): Promise<AsyExecutorAccount>{
        const prov = await Provider.findOne({where: {id: providerId}});
        if(!prov)
            throw new Error("Wrong provider ID!");

        const acc = await Account.create({
            providerId: prov.id,
            userId: userId,
            name: params.name,
            prefs: JSON.stringify(params.prefs),
            active: params.active,
            type: prov.isRemote() ? AccountType.REMOTE : AccountType.SERVER,
        });

        acc.provider = prov;
        acc.tasks = [];

        return new AsyExecutorAccountImpl(acc);
    }

    public async resetQueuedTasks(fingerprint: string, userId: string): Promise<number>{
        const accs = await this.getAccountModels(userId, undefined, AccountType.REMOTE);
        let reset = 0;
        const accids = accs.map(acc => acc.id);
        await this.sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        }, async () => {
            const qes = await QueuedExecution.findAll({
                include: [Execution], where: {
                    accountId: accids,
                    fingerprint: fingerprint,
                    "$execution.status$": {
                        [Op.ne]: ExecutionStatus.INQUEUE
                    }
                }
            });

            for(let qe of qes){
                const exe = qe.execution;
                if(exe.status !== ExecutionStatus.INPROGRESS)
                    await qe.destroy();
                if(exe.status === ExecutionStatus.INPROGRESS){
                    const e = await Execution.create({
                        accountId: exe.accountId,
                        status: ExecutionStatus.INQUEUE,
                        task: exe.task,
                        prefs: exe.prefs
                    });
                    qe.executionId = e.id;
                    qe.fingerprint = null;
                    await qe.save();
                    ++reset;

                    const at = await AccountTask.findOne({where: {executionId: exe.id}});
                    if(at){
                        at.lastStatus = e.status;
                        at.executionId = e.id;
                        await at.save();
                    }
                }
            }
        });

        return reset;
    }

    public async getQueuedTasks(fingerprint: string, userId?: string, accIds?: number[]): Promise<AsyQueuedTask[]>{
        const accs = await this.getAccountModels(userId, accIds, AccountType.REMOTE);
        const accids = accs.map(acc => acc.id);
        const accsO = _.keyBy(accs, "id");

        if(!accids.length)
            return [];

        const qeToExecute: QueuedExecution[] = [];

        await this.sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        }, async () => {
            const qes = await QueuedExecution.findAll({include: [Execution], where: {accountId: accids}});
            const sortedqes: {
                [accId: number]: {
                    [task: string]: QueuedExecution[]
                }
            } = {};

            for(let qe of qes){
                let qeacc = sortedqes[qe.accountId];
                if(!qeacc)
                    qeacc = sortedqes[qe.accountId] = {};
                const task = qe.execution.task || '';
                let qetasks = qeacc[task];
                if(!qetasks)
                    qetasks = qeacc[task] = [];

                qetasks.push(qe);
            }

            for(let accid in sortedqes){
                const qeacc = sortedqes[accid];
                for(let task in qeacc){
                    const qetasks = qeacc[task];
                    if(qetasks.length) {
                        qetasks.sort(QueuedExecution.compareByDependency);
                        const qe = qetasks[0];
                        if(qe.execution.status === ExecutionStatus.INQUEUE)
                            qeToExecute.push(qe);
                    }
                }
            }

            for(let qe of qeToExecute){
                qe.execution.status = ExecutionStatus.INPROGRESS;
                await qe.execution.save();
                qe.fingerprint = fingerprint;
                qe.token = uuid();
                await qe.save();
            }
        });

        return qeToExecute.map(qe => new AsyQueuedTaskImpl(qe, accsO[qe.accountId]));
    }

    public async executionLog(token: string, message: string): Promise<void>{
        const qe = await QueuedExecution.findOne({where: {token: token}});
        if(!qe)
            throw new Error("Execution not found!");

        await ExecutionLog.create({
            content: message,
            executionId: qe.executionId
        });
    }

    public async executionSetResult(token: string, result: AsyBalanceResult, finish?: boolean): Promise<void>{
        const qe = await QueuedExecution.findOne({include: [Execution], where: {token: token}});
        if(!qe)
            throw new Error("Execution not found!");

        qe.execution.addResult(result, finish);
        if(finish)
            qe.execution.finishedAt = new Date();
        await qe.execution.save();

        if(finish){
            await qe.destroy();
        }
    }

    public async executionSaveData(token: string, data: AsyAccountSavedData|null = {}): Promise<AsyAccountSavedData>{
        let sd: AsyAccountSavedData = {};
        let key = '';

        await this.sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        }, async () => {
            const qe = await QueuedExecution.findOne({include: [Account, Execution], where: {token: token}});
            if(!qe)
                throw new Error("Execution not found!");

            key = AsyQueuedTaskImpl.getSavedDataKey(qe.execution, qe.account);

            const newData = {[key]: data};

            if(qe.account.savedData)
                sd = JSON.parse(qe.account.savedData);

            sd = Merge.merge(sd, newData);

            qe.account.savedData = JSON.stringify(sd);
            await qe.account.save();
        });

        return sd[key];
    }

    public async executionLoggedIn(token: string, loggedInData?: string): Promise<string>{
        const qe = await QueuedExecution.findOne({where: {token: token}});
        if(!qe)
            throw new Error("Execution not found!");

        if(loggedInData){
            qe.loggedIn = loggedInData;
            await qe.save();
        }

        return qe.loggedIn || "";
    }

}