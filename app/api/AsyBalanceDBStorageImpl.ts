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
    AsyRetrieveType,
} from "asy-balance-core";
import Code from "../../models/Code";

type DeferredCode = {
    resolve?: (code?: string) => void,
    reject?: (err: Error) => void,
    promise?: Promise<string>
}

export default class AsyBalanceDBStorageImpl implements AsyBalanceInnerStorageApi, AsyBalanceInnerTraceApi, AsyBalanceInnerResultApi, AsyBalanceInnerRetrieveApi{
    private accPromise?: Promise<Account>;
    private account?: Account;
    private static codePromises: {[id: string]: DeferredCode} = {};

    constructor(private accId: string){}

    async retrieveCode(options: string | AsyRetrieveOptions): Promise<StringCallResponse<string>> {
        const acc = await this.getAccount();

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
            executionId: acc.executionId,
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
        if(this.account)
            return this.account;

        if(!this.accPromise)
            this.accPromise = Account.findOne({include: [Execution], attributes: ['id', 'savedData', 'executionId'], where: {id: this.accId}});
        let acc = await this.accPromise;

        if(!acc)
            throw new Error('Account ' + this.accId + ' does not exist!');

        if(!acc.execution)
            throw new Error('Account ' + this.accId + ' is not being executed!');

        this.account = acc;

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
            console.log(data);

            let acc = await this.getAccount();
            if(typeof data === 'string')
                data = JSON.parse(data);

            if(acc.execution.result){
                let res = JSON.parse(acc.execution.result);
                let resArr = Array.isArray(res) ? res : [res];
                resArr.push(data);
                acc.execution.result = JSON.stringify(resArr, null, '  ');
            }else{
                acc.execution.result = JSON.stringify(data, null, '  ');
            }

            await acc.execution.save();

            return {payload: undefined};
        }catch(e){
            console.error('setResult failed: ' + e.message);
            return {payload: undefined};
        }
    }

    async trace(msg: string, callee: string): Promise<StringCallResponse<void>> {
        let acc = await this.getAccount();

        const message = (callee ? `[${callee}] ` : '') + msg;
        console.log("acc" + acc.id + ": " + message);

        let elog = ExecutionLog.build({
            content: message,
            executionId: acc.execution.id
        });
        await elog.save();

        return {payload: undefined};
    }

}