import {AsyBalancePreferences, AsyCookie} from "asy-balance-core";
import QueuedExecution from "../models/QueuedExecution";
import Account from "../models/Account";
import Execution from "../models/Execution";
import {AsyExecutorProvider} from "./AsyExecutorProvider";

export type AsySavedData = {
    [login: string]: AsyAccountSavedData
};

export type AsyAccountSavedData = {
    cookies?: AsyCookie[],
    [name: string]: any
};

export interface AsyQueuedTask {
    readonly id: number
    readonly accountId: number
    readonly providerTextId: string
    readonly executionId: number
    readonly task: string
    readonly prefs: AsyBalancePreferences
    readonly savedData: AsyAccountSavedData
    readonly token: string
}

const SD_PREFIX = '__SD-KEY_%PROVIDER_ID%_';


export class AsyQueuedTaskImpl implements AsyQueuedTask{
    readonly id: number
    readonly accountId: number
    readonly task: string
    readonly token: string
    readonly providerTextId: string
    readonly prefs: AsyBalancePreferences
    readonly savedData: AsyAccountSavedData
    readonly executionId: number

    public constructor(qe: QueuedExecution, acc: Account, prov: AsyExecutorProvider){
        this.id = qe.id;
        this.task = qe.execution.task;
        this.prefs = qe.execution.getPrefs();
        this.token = qe.token;
        this.accountId = acc.id;
        this.providerTextId = prov.textId;
        this.executionId = qe.executionId;
        const savedData = acc.savedData ? JSON.parse(acc.savedData) : {}
        let key = AsyQueuedTaskImpl.getSavedDataKey(qe.execution, acc);
        this.savedData = savedData[key];
    }

    public static getSavedDataKey(e: Execution, acc: Account): string {
        const prefs = e.getPrefs();
        let key = SD_PREFIX.replace(/%PROVIDER_ID%/g, '' + acc.providerId);
        if(prefs?.common?.login)
            key += prefs?.common?.login;
        return key;
    }

}