import {Sequelize} from "sequelize-typescript";
import AsyBalanceDBStorageImpl from "../app/api/AsyBalanceDBStorageImpl";
import {AsyExecutorAccount, AsyExecutorAccountImpl, AsyExecutorAccountUpdateParams} from "./AsyExecutorAccountImpl";
import Account, {AccountType} from "../models/Account";
import AccountTask from "../models/AccountTask";
import Provider from "../models/Provider";
import SingleInit from "./SingleInit";
import {ExecutionStatus} from "../models/Execution";
import log from "./log";
import Code from "../models/Code";

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
        this.sequelize =  new Sequelize(config.connection_string, {
            timezone: config.timezone,
            logging: config.db_logging === undefined ? true : config.db_logging,
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
        const tasks = await AccountTask.findAll({where: {lastStatus: ExecutionStatus.INPROGRESS}});
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

    public async getAccounts(userId?: string, ids?: number[], type?: AccountType): Promise<AsyExecutorAccount[]>{
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

        const accs = await Account.findAll({include: [Provider, AccountTask], where: where});
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
            active: params.active
        });

        acc.provider = prov;
        acc.tasks = [];

        return new AsyExecutorAccountImpl(acc);
    }


}