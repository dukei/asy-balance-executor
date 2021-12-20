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

@Table({tableName: 'ab_providers', underscored: true, timestamps: false})
export default class Provider extends Model {
    @Column
    name!: string;

    @Column
    type!: string;

    @Column
    data!: Buffer;

    @Column(DataType.INTEGER)
    version!: number;

    @Column
    textVersion!: string;

    @Column
    disabled!: number;

    @Column
    createdAt!: Date;

    @Column
    updatedAt!: Date;

    public isRemote(): boolean {
        return /^ab2-remote-/.test(this.type);
    }
}