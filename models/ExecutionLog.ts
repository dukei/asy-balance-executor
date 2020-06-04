import {
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
} from "sequelize-typescript";

import Execution from "./Execution";

@Table({tableName: 'ab_execution_logs'})
export default class ExecutionLog extends Model<ExecutionLog> {
    @ForeignKey(() => Execution)
    @Column
    executionId!: number;

    @Column(DataType.TEXT)
    content!: string

    @Column
    createdAt!: Date

}