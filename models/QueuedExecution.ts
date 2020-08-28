import {
    AllowNull, BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    Table, UpdatedAt,
} from "sequelize-typescript";

import Execution, {ExecutionStatus} from "./Execution";
import Account from "./Account";

@Table({tableName: 'ab_queued_executions'})
export default class QueuedExecution extends Model<QueuedExecution> {
    @ForeignKey(() => Account)
    @Column
    accountId!: number;

    @ForeignKey(() => Execution)
    @Column
    executionId!: number;

    @BelongsTo(() => Execution)
    execution!: Execution;

    @BelongsTo(() => Account)
    account!: Account;

    @AllowNull
    @Column(DataType.STRING)
    depends?: string

    @CreatedAt
    createdAt!: Date;

    @UpdatedAt
    updatedAt!: Date;

    @Column(DataType.DATE)
    lockedTill?: Date

    @Column(DataType.STRING)
    token!: string

    @AllowNull
    @Column(DataType.STRING)
    fingerprint?: string|null

    public static compareByDependency(qe1: QueuedExecution, qe2: QueuedExecution): number{
        return qe1.id - qe2.id;
    }
}