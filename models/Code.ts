import {
    AllowNull, BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey, HasOne,
    Model,
    Table, UpdatedAt,
} from "sequelize-typescript";

import Execution from "./Execution";

export enum ExecutionStatus{
    INPROGRESS= 'INPROGRESS',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR'
}

@Table({tableName: 'ab_codes', underscored: true, timestamps: false})
export default class Code extends Model {
    @ForeignKey(() => Execution)
    @Column
    executionId!: number;

    @Column
    createdAt!: Date

    @BelongsTo(() => Execution)
    execution!: Execution;

    @AllowNull
    @Column(DataType.TEXT)
    params!: string;

    @AllowNull
    @Column
    till!: Date

}