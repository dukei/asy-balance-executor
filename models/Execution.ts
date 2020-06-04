import {
    AllowNull,
    Column,
    CreatedAt,
    DataType,
    ForeignKey, HasOne,
    Model,
    PrimaryKey,
    Table,
} from "sequelize-typescript";

import Account from "./Account";

@Table({tableName: 'ab_executions'})
export default class Execution extends Model<Execution> {
    @ForeignKey(() => Account)
    @Column
    accountId!: number;

    @Column(DataType.ENUM('INPROGRESS', 'SUCCESS', 'ERROR'))
    status!: 'INPROGRESS'|'SUCCESS'|'ERROR'

    @Column
    createdAt!: Date

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
}