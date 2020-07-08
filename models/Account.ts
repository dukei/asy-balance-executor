import {
    AllowNull,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey, HasMany,
    Model,
    Table,
    UpdatedAt
} from 'sequelize-typescript';
import Provider from "./Provider";
import Execution, {ExecutionStatus} from "./Execution";
import AccountTask from "./AccountTask";

@Table({tableName: 'ab_accounts'})
export default class Account extends Model<Account> {
    @ForeignKey(() => Provider)
    @Column
    providerId!: number;

    @AllowNull
    @Column
    userId?: string;

    @AllowNull
    @Column
    name?: string;

    @BelongsTo(() => Provider)
    provider!: Provider;

    @ForeignKey(() => Execution)
    @AllowNull
    @Column
    executionId!: number;

    @BelongsTo(() => Execution)
    execution!: Execution;

    @CreatedAt
    createdAt!: Date;

    @UpdatedAt
    updatedAt!: Date;

    @HasMany(() => AccountTask, 'account_id')
    tasks!: AccountTask[]

    @Column
    savedData!: string;

    @Column
    prefs!: string;

    @Column
    active!: boolean;

    @Column
    proxy!: string;
}