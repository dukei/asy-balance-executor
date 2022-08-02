import {ExecutionStatus} from "../models/Execution";
import {AsyBalanceResult, AsyBalanceResultError, AsyBalanceResultSuccess} from "asy-balance-core";
import AccountTask from "../models/AccountTask";
import {AsyCode, AsyCodeImpl} from "./AsyCode";
import {Op, Sequelize} from "sequelize";
import Code from "../models/Code";

export interface AsyTaskStatus {
    task: string
    status: ExecutionStatus
    startTime?: Date //Только в случае status = 'INPROGRESS'
    executionId?: number //Только в случае status = 'INPROGRESS'
    resultSuccessJSON?: string
    resultSuccess: AsyBalanceResult[]
    resultSuccessTime?: Date
    resultErrorJSON?: string
    resultError: AsyBalanceResultError[]
    resultErrorTime?: Date

    lastFinishedStatus: ExecutionStatus;
    lastError: string | undefined
    codes: Promise<AsyCode[]>

    isError(): boolean
    getLastResult(): [AsyBalanceResult[],Date]|undefined
    refresh(): Promise<void>;
}

export type AsyTaskStatuses = {[name: string]: AsyTaskStatus}

export class AsyTaskStatusImpl implements AsyTaskStatus{
    private model: AccountTask;

    public task!: string
    public status!: ExecutionStatus
    public startTime?: Date //Только в случае status = 'INPROGRESS'
    public executionId?: number //Только в случае status = 'INPROGRESS'
    public resultSuccessJSON?: string
    public resultSuccessTime?: Date
    public resultErrorJSON?: string
    public resultErrorTime?: Date

    constructor(model: AccountTask) {
        this.model = model;
        this.readModel();
    }

    readModel() {
        const model = this.model;
        this.task = model.task;
        this.status = model.lastStatus;
        if(this.status === ExecutionStatus.INPROGRESS){
            this.startTime = model.lastStartTime;
            this.executionId = model.executionId;
        }
        this.resultErrorJSON = model.lastResultError;
        this.resultSuccessJSON = model.lastResultSuccess;
        this.resultSuccessTime = model.lastResultSuccessTime;
        this.resultErrorTime = model.lastResultErrorTime;
    }

    getLastResult(): [AsyBalanceResult[], Date] | undefined {
        if(this.resultErrorTime && this.resultSuccessTime){
            if(this.resultErrorTime > this.resultSuccessTime){
                return [this.resultError, this.resultErrorTime]
            }else{
                return [this.resultSuccess, this.resultSuccessTime]
            }
        }else if(this.resultErrorTime){
            return [this.resultError, this.resultErrorTime]
        }else if(this.resultSuccessTime){
            return [this.resultSuccess, this.resultSuccessTime]
        }
    }

    get resultSuccess(): AsyBalanceResult[] {
        return this.resultSuccessJSON ? JSON.parse(this.resultSuccessJSON) : [];
    }

    get resultError(): AsyBalanceResultError[] {
        return this.resultErrorJSON ? JSON.parse(this.resultErrorJSON) : [];
    }

    get lastFinishedStatus(): ExecutionStatus {
        if(this.resultErrorTime && this.resultSuccessTime){
            if(+this.resultErrorTime > +this.resultSuccessTime) {
                return ExecutionStatus.ERROR;
            }else{
                return ExecutionStatus.SUCCESS;
            }
        }else if(this.resultErrorTime){
            return ExecutionStatus.ERROR;
        }else if(this.resultSuccessTime){
            return ExecutionStatus.SUCCESS;
        }else{
            return ExecutionStatus.IDLE;
        }
    }

    public isError(){
        if(!this.resultErrorTime)
            return false;
        if(!this.resultSuccessTime)
            return true;
        return this.resultErrorTime.getTime() > this.resultSuccessTime.getTime();
    }

    get lastError(): string | undefined {
        const res = this.resultError;
        if(!res.length)
            return 'Empty result';
        return res[0].message || 'Unknown error';
    }

    get codes(): Promise<AsyCode[]> {
        if(this.status !== ExecutionStatus.INPROGRESS)
            return Promise.resolve([]);

        const till = this.model.needCodeTill?.getTime();
        const now = new Date();
        if(!till || till <= +now)
            return Promise.resolve([]);

        return (async () => {
            let codes: Code[] = await Code.findAll({
                where: {
                    executionId: this.executionId!,
                    till: {
                        [Op.gt]: <Date><any>Sequelize.fn('NOW')
                    }
                }
            });
            return codes.map(c => new AsyCodeImpl(c));
        })();
    }

    async refresh(): Promise<void> {
        await this.model.reload()
        this.readModel();
    }
}

