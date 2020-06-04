
import Account from "../../models/Account";
import Execution from "../../models/Execution";
import ExecutionLog from "../../models/ExecutionLog";
import { StringCallResponse, AsyBalanceInnerStorageApi, AsyBalanceInnerTraceApi, AsyBalanceInnerResultApi, AsyBalanceResult } from "asy-balance-core";

export default class AsyBalanceDBStorageImpl implements AsyBalanceInnerStorageApi, AsyBalanceInnerTraceApi, AsyBalanceInnerResultApi{
    private accPromise?: Promise<Account>;
    private account?: Account;

    constructor(private accId: string){}

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