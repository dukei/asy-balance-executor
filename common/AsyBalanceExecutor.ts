import {Sequelize} from "sequelize-typescript";
import AsyBalanceDBStorageImpl from "../app/api/AsyBalanceDBStorageImpl";

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
}