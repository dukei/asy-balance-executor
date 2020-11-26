import log from "./log";

export type SingleInitOptions<T> = {
    value?: T
    getT?: () => Promise<T>
}

export default class SingleInit<T>{
    public value?: T
    private valuePromise?: Promise<T>
    private options: SingleInitOptions<T>

    constructor(options?: SingleInitOptions<T>){
        this.options = options || {};
        this.value = this.options.value;
    }

    async get(options?: SingleInitOptions<T>): Promise<T>{
        let {value, getT} = options || {};
        if(value && !this.value)
            this.value = value;
        if(this.value !== undefined)
            return this.value;

        try {
            if (!this.valuePromise) {
                if (!getT)
                    getT = this.options.getT;
                if (!getT)
                    throw new Error('Single initialization function is not set!');
                this.valuePromise = getT();
            }

            let value = await this.valuePromise;

            return this.value = value;
        }finally {
            this.valuePromise = undefined;
        }
    }
}

export type DoubleCheckLockCondition = () => boolean;
export type DoubleCheckLockAction = () => Promise<any>

export class DoubleCheckLock{
    private static locks: {[name: string]: Promise<any>} = {};

    public static async lock(condition: DoubleCheckLockCondition, action: DoubleCheckLockAction, name: string = ''): Promise<void>{
        if(condition()){
            while(this.locks[name]) {
                try {
                    //log.info("Waiting for lock " + name)
                    await this.locks[name]
                } catch (e) {
                } finally {
                    delete this.locks[name]
                }
                await Promise.resolve(); //Подождать, чтобы кто-то занял лок заново
            }

            if(condition()){
                this.locks[name] = action();
                try {
                    await this.locks[name];
                }finally{
                    delete this.locks[name];
                }
            }
        }

    }
}

