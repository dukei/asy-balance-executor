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
import {AsyBalanceResult, AsyBalanceResultError, AsyBalanceResultSuccess} from "asy-balance-core";

export enum ExecutionStatus{
    IDLE='IDLE',
    INQUEUE='INQUEUE',
    INPROGRESS= 'INPROGRESS',
    SUCCESS = 'SUCCESS',
    SUCCESS_PARTIAL = "SUCCESS_PARTIAL",
    ERROR = 'ERROR'
}

@Table({tableName: 'ab_executions'})
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

    public async addResult(result: AsyBalanceResult, setStatus?: boolean){
        let results: AsyBalanceResult[] = [];
        if(this.result){
            results = JSON.parse(this.result);
        }
        results.push(result);
        this.result = JSON.stringify(results);
        if(setStatus)
            this.status = Execution.getStatusFromResult(results);
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


}