import {Sequelize} from "sequelize-typescript";
import AsyBalanceDBStorageImpl from "../app/api/AsyBalanceDBStorageImpl";
import {AsyExecutorAccount, AsyExecutorAccountImpl, AsyExecutorAccountUpdateParams} from "./AsyExecutorAccountImpl";
import Account from "../models/Account";
import AccountTask from "../models/AccountTask";
import Provider from "../models/Provider";

export type AsyBalanceExecutorConfig = {
    connection_string: string
}

export default class AsyBalanceExecutor{
    private static instance?: AsyBalanceExecutor;
    private static config: AsyBalanceExecutorConfig;

    public readonly sequelize: Sequelize;

    private constructor(config: AsyBalanceExecutorConfig) {
        this.sequelize =  new Sequelize(config.connection_string, {
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

    public static getInstance(config?: AsyBalanceExecutorConfig): AsyBalanceExecutor{
        if(!AsyBalanceExecutor.instance){
            const _config = config || AsyBalanceExecutor.config;
            if(!_config)
                throw new Error('No config specified neither in argument or in setConfig!');
            AsyBalanceExecutor.instance = new AsyBalanceExecutor(_config);
        }

        return AsyBalanceExecutor.instance;
    }

    public async enterCode(codeId: string, code: string): Promise<void>{
        await AsyBalanceDBStorageImpl.resolveCode(codeId, code);
    }

    public async getAccounts(userId?: string, ids?: number[]): Promise<AsyExecutorAccount[]>{
        const where: {[name: string]: any} = {};
        if(userId)
            where.userId = userId;

        if(ids){
            if(ids.length === 0)
                where.active = 1;
            else
                where.id = ids;
        }

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