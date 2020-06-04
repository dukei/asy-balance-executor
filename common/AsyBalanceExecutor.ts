import {Sequelize} from "sequelize-typescript";
import Account from "../models/Account";
import Execution from "../models/Execution";
import Provider from "../models/Provider";
import ExecutionLog from "../models/ExecutionLog";
import ProviderDB from "./ProviderDB";

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

    public static readonly Models = {
        Account, Execution, Provider, ExecutionLog
    };
    public static readonly Provider = ProviderDB;
}