import {
    AllowNull,
    Column,
    CreatedAt,
    DataType,
    ForeignKey, HasMany,
    Model,
    PrimaryKey,
    Table, UpdatedAt,
} from "sequelize-typescript";

@Table({tableName: 'ab_providers'})
export default class Provider extends Model<Provider> {
    @Column
    name!: string;

    @Column
    type!: string;

    @Column
    data!: Buffer;

    @Column(DataType.INTEGER)
    version!: number;

    @CreatedAt
    createdAt!: Date;

    @UpdatedAt
    updatedAt!: Date;
}