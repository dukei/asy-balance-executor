import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    PrimaryKey,
    UpdatedAt,
    CreatedAt, AllowNull, BelongsTo
} from 'sequelize-typescript';
import Provider from "./Provider";
import Execution from "./Execution";

@Table({tableName: 'ab_accounts'})
export default class Account extends Model<Account> {
    @ForeignKey(() => Provider)
    @Column
    providerId!: number;

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

    @AllowNull
    @Column(DataType.ENUM('INPROGRESS', 'SUCCESS', 'ERROR'))
    lastStatus!: 'INPROGRESS'|'SUCCESS'|'ERROR'

    @Column
    savedData!: string;

    @Column
    prefs!: string;

    @Column
    active!: boolean;

    @Column
    proxy!: string;
}