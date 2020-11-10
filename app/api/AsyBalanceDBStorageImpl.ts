import Account from "../../models/Account";
import Execution, {ExecutionStatus} from "../../models/Execution";
import ExecutionLog from "../../models/ExecutionLog";
import {
    AsyBalanceInnerResultApi,
    AsyBalanceInnerRetrieveApi,
    AsyBalanceInnerStorageApi,
    AsyBalanceInnerTraceApi,
    AsyBalanceResult,
    AsyRetrieveOptions,
    StringCallResponse,
    AsyRetrieveType, AsyBalanceResultError,
} from "asy-balance-core";
import Code from "../../models/Code";
import SingleInit from "../../common/SingleInit";

type DeferredCode = {
    resolve?: (code?: string) => void,
    reject?: (err: Error) => void,
    promise?: Promise<string>
}

export default class AsyBalanceDBStorageImpl implements AsyBalanceInnerStorageApi, AsyBalanceInnerTraceApi, AsyBalanceInnerResultApi, AsyBalanceInnerRetrieveApi{
    private acc: SingleInit<Account>;
    private static codePromises: {[id: string]: DeferredCode} = {};

    constructor(private exec: Execution, acc?: Account){
        this.acc = new SingleInit<Account>({value: acc});
    }

    async retrieveCode(options: string | AsyRetrieveOptions): Promise<StringCallResponse<string>> {
        let _options: AsyRetrieveOptions;
        if(typeof(options) === 'string')
            _options = JSON.parse(options);
        else
            _options = options || {};

        if(_options.type !== AsyRetrieveType.CODE && _options.type !== AsyRetrieveType.IMAGE){
            throw new Error('Unsupported code type: ' + _options.type);
        }

        const timeout = _options.time = _options.time || 60000;

        const code = await Code.create({
            executionId: this.exec.id,
            till: new Date(+new Date() + timeout),
            params: JSON.stringify(_options, null, '  ')
        });

        try {
            const dc: DeferredCode = {};
            dc.promise = new Promise<string>((resolve, reject) => {
                dc.resolve = resolve;
                dc.reject = reject;
            });
            AsyBalanceDBStorageImpl.codePromises[code.id] = dc;

            const timeoutMarker = '$#ab_timeout';

            const sleepPromise = new Promise<string>((resolve, reject) => {
                setTimeout(resolve, timeout, timeoutMarker);
            });

            let result = await Promise.race([dc.promise, sleepPromise]);
            if (result === timeoutMarker)
                throw new Error("User has not entered the code");

            if (!result)
                throw new Error("User cancelled entering the code");

            return {payload: result};
        }finally{
            delete AsyBalanceDBStorageImpl.codePromises[code.id];
            code.destroy();
        }
    }

    public static async resolveCode(codeId: string, code: string){
        const dc: DeferredCode = AsyBalanceDBStorageImpl.codePromises[codeId];
        if(!dc)
            throw new Error("Wrong codeId or code input is timed out");

        dc.resolve!(code);
    }

    private async getAccount(): Promise<Account>{
        const acc = await this.acc.get({
            getT: async (): Promise<Account> => {
                let acc = await Account.findOne({where: {id: this.exec.accountId}});
                if(!acc)
                    throw new Error('Can not find account by execution: ' + this.exec.accountId);
                return acc;
            }
        });

        return acc;
    }

    async loadData(): Promise<StringCallResponse<string>> {
        let acc = await this.getAccount();
        return {payload: acc.savedData};
    }

    async saveData(data: string): Promise<StringCallResponse<void>> {
        let acc = await this.getAccount();
        acc.savedData = data;
        await acc.save();

        return {payload: undefined};
    }

    async setResult(data: string | AsyBalanceResult): Promise<StringCallResponse<void>> {
        try {
            await this.exec.addResult(data);
            await this.exec.save();

            return {payload: undefined};
        }catch(e){
            console.error('setResult failed: ' + e.message);
            return {payload: undefined};
        }
    }

    async trace(msg: string, callee: string): Promise<StringCallResponse<void>> {
        const message = (callee ? `[${callee}] ` : '') + msg;
        console.log("acc" + this.exec.accountId + " (" + this.exec.task + "): " + message);

        let elog = ExecutionLog.build({
            content: message,
            executionId: this.exec.id
        });
        await elog.save();

        return {payload: undefined};
    }

}