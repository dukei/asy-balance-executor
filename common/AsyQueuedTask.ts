import {AsyBalancePreferences, AsyCookie} from "asy-balance-core";
import QueuedExecution from "../models/QueuedExecution";
import Account from "../models/Account";

export type AsyAccountSavedData = {
    [login: string]: {
        cookies?: AsyCookie[],
        [name: string]: any
    }
};

export interface AsyQueuedTask {
    readonly id: number
    readonly accName: string
    readonly task: string
    readonly prefs: AsyBalancePreferences
    readonly savedData: AsyAccountSavedData
    readonly token: string
}

export class AsyQueuedTaskImpl implements AsyQueuedTask{
    readonly id: number
    readonly accName: string
    readonly task: string
    readonly token: string
    readonly prefs: AsyBalancePreferences
    readonly savedData: AsyAccountSavedData

    public constructor(qe: QueuedExecution, acc: Account){
        this.id = qe.execution.id;
        this.task = qe.execution.task;
        this.prefs = qe.execution.prefs ? JSON.parse(qe.execution.prefs) : {}
        this.token = qe.token;
        this.accName = acc.name || "";
        this.savedData = acc.savedData ? JSON.parse(acc.savedData) : {}
    }

}