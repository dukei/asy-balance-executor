import Account from "../models/Account";
import Provider from "../models/Provider";
import log from "./log";
import AsyBalanceDBStorageImpl from "../app/api/AsyBalanceDBStorageImpl";
import Execution, {ExecutionStatus} from "../models/Execution";
import {AsyBalanceProvider, AsyBalanceResult, AsyBalanceResultError} from "asy-balance-core";
import SingleInit from "./SingleInit";


export default class ProviderDB{
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

    public async execute(): Promise<AsyBalanceResult[]>{
        log.info('About to execute account ' + this.accId);

        const [prov, acc] = await Promise.all([
            this.getProviderBundle(),
            this.getAccount()
        ]);

        const prefs = acc.prefs ? JSON.parse(acc.prefs) : {};
        prefs.proxy = acc.proxy || undefined;

        let stimpl = new AsyBalanceDBStorageImpl('' + acc.id);
        let exec = Execution.build({
            status: ExecutionStatus.INPROGRESS,
            prefs: JSON.stringify(prefs, null, '  '),
            accountId: acc.id
        });

        await exec.save();

        log.info('Starting account ' + this.accId + ' provider ' + acc.provider.type);
        let result: AsyBalanceResult[] = [];

        try {
            result = await prov.execute({
                accId: '' + this.accId,
                preferences: prefs,
                apiTrace: stimpl,
                apiStorage: stimpl,
                apiResult: stimpl,
                apiRetrieve: stimpl,
                proxy: prefs.proxy
            })

            exec.status = ExecutionStatus.SUCCESS;
            log.info("Account " + this.accId + " finished successfully!");
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

}