import {
    AllowNull, BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table, UpdatedAt,
} from "sequelize-typescript";

import Execution, {ExecutionStatus} from "./Execution";
import Account from "./Account";

@Table({tableName: 'ab_account_tasks'})
export default class AccountTask extends Model<AccountTask> {
    @PrimaryKey
    @ForeignKey(() => Account)
    @Column
    accountId!: number;

    @PrimaryKey
    @Column
    task!: string;

    @ForeignKey(() => Execution)
    @AllowNull
    @Column
    executionId!: number;

    @BelongsTo(() => Execution)
    execution!: Execution;

    @BelongsTo(() => Account)
    account!: Account;

    @AllowNull
    @Column(DataType.ENUM(ExecutionStatus.IDLE, ExecutionStatus.INPROGRESS, ExecutionStatus.SUCCESS, ExecutionStatus.SUCCESS_PARTIAL, ExecutionStatus.ERROR))
    lastStatus!: ExecutionStatus

    @AllowNull
    @Column
    lastResultSuccess?: string;

    @AllowNull
    @Column
    lastResultSuccessTime?: Date;

    @AllowNull
    @Column
    lastResultError?: string;

    @AllowNull
    @Column
    lastResultErrorTime?: Date;

    @Column
    lastStartTime?: Date;

    @Column
    needCodeTill?: Date;

    @Column
    codeCnt!: number;
}