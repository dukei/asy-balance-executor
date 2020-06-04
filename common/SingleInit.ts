export type SingleInitOptions<T> = {
    value?: T
    getT?: () => Promise<T>
    initT?: (t: T) => T
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
        let {value, getT, initT} = options || {};
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
            if(!initT)
                initT = this.options.initT;
            if(initT)
                value = initT(value);

            return this.value = value;
        }finally {
            this.valuePromise = undefined;
        }
    }
}

