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
import AccountTask from "./AccountTask";
import {ExecutionStatus} from "./Execution";

export enum AccountType{
    SERVER = 'SERVER',
    REMOTE = 'REMOTE',
}


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

    @Column(DataType.ENUM(AccountType.SERVER, AccountType.REMOTE))
    type!: AccountType

}