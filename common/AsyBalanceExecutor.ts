import {Sequelize} from "sequelize-typescript";
import AsyBalanceDBStorageImpl from "../app/api/AsyBalanceDBStorageImpl";
import {AsyExecutorAccount, AsyExecutorAccountImpl, AsyExecutorAccountUpdateParams} from "./AsyExecutorAccountImpl";
import Account, {AccountType} from "../models/Account";
import AccountTask from "../models/AccountTask";
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
import {AsyExecutorProvider} from "./AsyExecutorProvider";
import Provider from "../models/Provider";

export type AsyBalanceExecutorConfig = {
    sequelize?: Sequelize
    connection_string?: string
    timezone?: string
    db_logging?: boolean
}

const DEAD_TASK_RESET_TIMEOUT = 180*1000;

export default class AsyBalanceExecutor{
    private static instance: SingleInit<AsyBalanceExecutor>;
    private static config: AsyBalanceExecutorConfig;

    public readonly sequelize: Sequelize;

    private constructor(config: AsyBalanceExecutorConfig) {
        const logging = config.db_logging || config.db_logging === undefined ? console.log : false;

        const namespace = cls.createNamespace("asy-balance-executor");
        //As of https://github.com/RobinBuschmann/sequelize-typescript/issues/336#issuecomment-375527175
        (Sequelize as any).__proto__.useCLS(namespace);

        let modelPaths = [__dirname + '/../models'];


        if(config.connection_string) {
            this.sequelize = new Sequelize(config.connection_string, {
                timezone: config.timezone,
                logging: logging,
                define: {
                    underscored: true,
                    timestamps: false,
                },
                pool: {
                    max: 30
                },
                models: modelPaths
            });
        }else{
            if(!config.sequelize)
                throw new Error("Either connection_string of sequelize instance should be specified!")

            this.sequelize = config.sequelize;
            this.sequelize.addModels(modelPaths);
        }

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
        const accs = await this.getAccountModels(userId, ids, type, [AccountTask]);
        return accs.map(acc => new AsyExecutorAccountImpl(acc));
    }

    public async createAccount(providerId: number, userId: string, params: AsyExecutorAccountUpdateParams): Promise<AsyExecutorAccount>{
        const prov = await AsyExecutorProvider.get(providerId);

        const acc = await Account.create({
            providerId: prov.id,
            userId: userId,
            name: params.name,
            prefs: JSON.stringify(params.prefs),
            active: params.active,
            type: prov.isRemote() ? AccountType.REMOTE : AccountType.SERVER,
        });

        acc.tasks = [];

        return new AsyExecutorAccountImpl(acc);
    }

    private async doResetQueuedTask(qe: QueuedExecution, fingerprint: string) {
        const exe = qe.execution;

        await ExecutionLog.create({
            executionId: exe.id,
            content: "Execution reset by " + fingerprint
        });
        const e = await Execution.create({
            accountId: exe.accountId,
            status: ExecutionStatus.INQUEUE,
            task: exe.task,
            prefs: exe.prefs
        });
        qe.execution = e;
        qe.executionId = e.id;
        qe.fingerprint = null;
    }

    private async shouldResetQueuedTask(qe: QueuedExecution, fingerprint: string): Promise<boolean>{
        const exe = qe.execution;
        if(exe.status !== ExecutionStatus.INPROGRESS || qe.fingerprint === fingerprint)
            return false;

        //Это чужая задача. Надо проверить, не зависла ли она
        const now = +new Date();
        if(now - exe.createdAt.getTime() < DEAD_TASK_RESET_TIMEOUT)
            return false; //Создана меньше 3 мин назад
        const el = await ExecutionLog.findOne({where: {
                executionId: exe.id
            }, order: [['id', 'DESC']]
        });
        if(el && now - el.createdAt.getTime() < DEAD_TASK_RESET_TIMEOUT)
            return false; //Последний лог меньше таймаута назад

        return true;
    }

    private async doResetQueuedTasks(fingerprint: string, userId: string): Promise<number>{
        const accs = await this.getAccountModels(userId, undefined, AccountType.REMOTE);
        let reset = 0;
        const accids = accs.map(acc => acc.id);

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
            let exe = qe.execution;
            if(exe.status !== ExecutionStatus.INPROGRESS)
                await qe.destroy();
            if(exe.status === ExecutionStatus.INPROGRESS){
                await this.doResetQueuedTask(qe, fingerprint);
                exe = qe.execution;

                await qe.save();
                ++reset;

                const at = await AccountTask.findOne({where: {executionId: exe.id}});
                if(at){
                    at.lastStatus = exe.status;
                    at.executionId = exe.id;
                    await at.save();
                }
            }
        }

        return reset;
    }

    public async resetQueuedTasks(fingerprint: string, userId: string): Promise<number>{
        const accs = await this.getAccountModels(userId, undefined, AccountType.REMOTE);
        let reset = 0;
        await this.sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        }, async () => {
            return this.doResetQueuedTasks(fingerprint, userId);
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
                        const exe = qe.execution;
                        if(exe.status === ExecutionStatus.INQUEUE) {
                            qeToExecute.push(qe);
                        }else if(await this.shouldResetQueuedTask(qe, fingerprint)){
                            //Continue to task termination
                            await this.doResetQueuedTask(qe, fingerprint);
                            qeToExecute.push(qe);
                        }
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

        const tasks: AsyQueuedTask[] = [];
        for(let qe of qeToExecute){
            const acc = accsO[qe.accountId];
            tasks.push(new AsyQueuedTaskImpl(qe, acc, await AsyExecutorProvider.get(acc.providerId)));
        }

        return tasks;
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

    public async getAccountByToken(token: string): Promise<AsyExecutorAccount>{
        const qe = await QueuedExecution.findOne({where: {token: token}});
        if(!qe)
            throw new Error("Execution not found!");

        const accs = await this.getAccounts(undefined, [qe.accountId]);
        if(!accs.length)
            throw new Error("Account not found!");
        return accs[0];
    }

    public async executionSetResult(token: string, result: AsyBalanceResult, finish?: boolean): Promise<void>{
        const qe = await QueuedExecution.findOne({include: [Execution], where: {token: token}});
        if(!qe)
            throw new Error("Execution not found!");

        await this.sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
        }, async () => {
            qe.execution.addResult(result, finish);
            if (finish)
                qe.execution.finishedAt = new Date();
            await qe.execution.save();

            if (finish) {
                await qe.destroy();
            }
        });
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

    public async getProviders(ids?: (number|string)[]): Promise<AsyExecutorProvider[]> {
        if(!ids)
            return AsyExecutorProvider.getAll();
        else{
            const result: AsyExecutorProvider[] = [];
            for(let id of ids){
                result.push(await this.getProvider(id))
            }
            return result;
        }
    }

    public async getProvider(id: number|string): Promise<AsyExecutorProvider> {
        return await AsyExecutorProvider.get(id)
    }

}