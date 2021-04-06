import {
    AllowNull, BelongsTo, BelongsToMany,
    Column,
    CreatedAt,
    DataType,
    ForeignKey, HasMany, HasOne,
    Model,
    Table, UpdatedAt,
} from "sequelize-typescript";

import Account from "./Account";
import Code from "./Code";
import {
    AsyBalancePreferences,
    AsyBalanceResult,
    AsyBalanceResultError,
    AsyBalanceResultSuccess
} from "asy-balance-core";

export enum ExecutionStatus{
    IDLE='IDLE',
    INQUEUE='INQUEUE',
    INPROGRESS= 'INPROGRESS',
    SUCCESS = 'SUCCESS',
    SUCCESS_PARTIAL = "SUCCESS_PARTIAL",
    ERROR = 'ERROR'
}

@Table({tableName: 'ab_executions', underscored: true, timestamps: false})
export default class Execution extends Model<Execution> {
    @ForeignKey(() => Account)
    @Column
    accountId!: number;

    @Column(DataType.ENUM(ExecutionStatus.INPROGRESS, ExecutionStatus.SUCCESS, ExecutionStatus.SUCCESS_PARTIAL, ExecutionStatus.ERROR))
    status!: ExecutionStatus

    @AllowNull
    @Column
    task!: string

    @CreatedAt
    @Column
    createdAt!: Date

    @UpdatedAt
    @Column
    updatedAt!: Date

    @Column
    finishedAt!: Date

    @AllowNull
    @Column(DataType.TEXT)
    prefs!: string

    @AllowNull
    @Column(DataType.TEXT)
    result!: string

    @BelongsTo(() => Account)
    account!: Account;

    @HasMany(() => Code, "execution_id")
    codes!: Code[]

    public async addResult(data: AsyBalanceResult|string, setStatus?: boolean){
        let result: AsyBalanceResult;

        if(typeof data === 'string')
            result = JSON.parse(data);
        else
            result = data;

        if(result.error){
            const resultError = result as any;
            resultError.message = `[${this.id}] ` + (resultError.message || 'Unspecified error');
        }

        const curResults = this.result;
        data = JSON.stringify(result);
        if(curResults){
            this.result = curResults.replace(/\]$/, ',' + data + ']');
        }else{
            this.result = '[' + data + ']';
        }

        if(setStatus) {
            const results = JSON.parse(this.result);
            this.status = Execution.getStatusFromResult(results);
        }
    }

    public static getStatusFromResult(result: AsyBalanceResult[]){
        let hasError = false, hasSuccess = false;
        for(let r of result){
            const rs = r as AsyBalanceResultSuccess;
            if(rs.success)
                hasSuccess = true;
            const re = r as AsyBalanceResultError;
            if(re.error)
                hasError = true;
            if(hasSuccess && hasError)
                break;
        }

        if(hasSuccess && hasError)
            return ExecutionStatus.SUCCESS_PARTIAL;
        if(hasSuccess)
            return ExecutionStatus.SUCCESS;
        return ExecutionStatus.ERROR;
    }

    public getPrefs(): AsyBalancePreferences {
        return this.prefs ? JSON.parse(this.prefs) : {}
    }

}