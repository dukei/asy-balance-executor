import {
    AllowNull, BelongsToMany,
    Column,
    CreatedAt,
    DataType,
    ForeignKey, HasMany, HasOne,
    Model,
    Table, UpdatedAt,
} from "sequelize-typescript";

import Account from "./Account";
import Code from "./Code";

export enum ExecutionStatus{
    IDLE='IDLE',
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

    @HasOne(() => Account)
    account!: Account;

    @HasMany(() => Code, "executionId")
    codes!: Code[]
}