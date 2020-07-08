import { AsyRetrieveInputType } from "asy-balance-core";
import Code from "../models/Code";

export enum AsyCodeType{
    IMAGE = 'IMAGE',
    CODE = 'CODE',
}

export interface AsyRetrieveParamsBase {
    type: AsyCodeType
    time: number
    prompt?: string
}

//type CODE
export interface AsyRetrieveParamsCode extends AsyRetrieveParamsBase{
    inputType?: AsyRetrieveInputType
}

//type IMAGE
export interface AsyRetrieveParamsImage extends AsyRetrieveParamsCode{
    image: string
}

export interface AsyCode {
    id: string
    params: AsyRetrieveParamsCode | AsyRetrieveParamsImage
    createdAt: Date
    till: Date
    currentTime: Date
}

export class AsyCodeImpl implements AsyCode {
    readonly id: string;
    readonly params: AsyRetrieveParamsBase;
    readonly createdAt: Date;
    readonly till: Date;
    readonly currentTime: Date;

    constructor(code: Code) {
        this.id = code.id;
        this.createdAt = code.createdAt;
        this.till = code.till;
        this.params = JSON.parse(code.params);
        this.currentTime = new Date();
    }


}
