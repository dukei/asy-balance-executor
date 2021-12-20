import Provider from "../models/Provider";
import {AsyBalanceProvider} from "asy-balance-core";
import {DoubleCheckLock} from "./SingleInit";
import log from "./log";

type ProviderDates = {
    provs: {[id: number]: number}, //Время изменения провайдеров
    lastModified: number, //Время последнего изменения провайдеров
}

const CHECK_FOR_UPDATES_INTERVAL = 60000;
const LOADING_PROVIDER = 'loading_provider';

export class AsyExecutorProvider {
    private provider: Provider;
    public provBundle: AsyBalanceProvider;
    public script!: string;
    public preferences!: string|null;
    public counters!: string;
    public icon!: Buffer|null;
    public maskedPreferences!: string[];

    get id(): number { return this.provider.id }
    get textId(): string { return this.provider.type }
    get name(): string { return this.provider.name }
    get createdAt(): Date { return this.provider.createdAt }
    get updatedAt(): Date { return this.provider.updatedAt }
    get version(): number { return this.provider.version }
    get textVersion(): string { return this.provider.textVersion }
    get disabled(): boolean { return this.provider.disabled != 0 }

    private constructor(prov: Provider, provBundle: AsyBalanceProvider) {
        this.provider = prov;
        this.provBundle = provBundle;
    }

    private async init(): Promise<void>{
        this.script = await this.provBundle.getScript();
        this.icon = await this.provBundle.getIcon();
        this.preferences = await this.provBundle.getPreferences();
        this.maskedPreferences = await this.provBundle.getMaskedPreferences();
        this.counters = await this.provBundle.getCounters();
    }

    private static provs: {[id: number]: AsyExecutorProvider|null} = {};
    private static provsByTextId: {[textId: string]: AsyExecutorProvider} = {};
    private static lastModified: number = 0;
    private static lastChecked: number = 0;


    private static getFromCache(id: number|string): AsyExecutorProvider|undefined {
        let p = this.isNumber(id) ? this.provs[+id] : this.provsByTextId[id];
        if(p)
            return p;
    }

    private static isNumber(id: number|string): boolean {
        if(typeof id === "number")
            return true;
        return /^\d+$/.test(id);
    }

    private static async doCreate(id: number|string): Promise<AsyExecutorProvider> {
        await DoubleCheckLock.lock(() => !this.getFromCache(id), async () => {
            log.info("Loading provider " + JSON.stringify(id));
            const prov = await Provider.findOne({where: this.isNumber(id) ? {id: id} : {type: id}});
            if (!prov)
                throw new Error('Provider not found: ' + id);
            let pb = await AsyBalanceProvider.create(prov.data);
            const aep = new AsyExecutorProvider(prov, pb);
            await aep.init();
            this.provs[prov.id] = aep;
            this.provsByTextId[prov.type] = aep;
            log.info("Loading provider " + JSON.stringify(id) + " done");
        }, LOADING_PROVIDER);

        return this.getFromCache(id)!;
    }

    private static async checkDates(){
        await DoubleCheckLock.lock(() => !this.lastChecked || this.lastChecked < +new Date() - CHECK_FOR_UPDATES_INTERVAL,
            async () => {
            log.info("Getting dates");
            const dates = await this.getDates();
            if (dates.lastModified !== this.lastModified) {
                this.lastModified = dates.lastModified;
                log.info("Updating providers");
                for (let pid in this.provs) {
                    const pold = this.provs[pid]?.provider;
                    if (pold && pold.updatedAt.getTime() !== dates.provs[pid]) {
                        if (dates.provs[pid])
                            this.provs[pid] = null;
                        else
                            delete this.provs[pid];
                        delete this.provsByTextId[pold.type];
                    }
                }
                for (let pid in dates.provs) {
                    if (this.provs[pid] === undefined)
                        this.provs[pid] = null;
                }
            }
            this.lastChecked = +new Date();
        }, LOADING_PROVIDER);
    }

    public static async get(id: number|string): Promise<AsyExecutorProvider> {
        await this.checkDates();

        let prov = this.getFromCache(id);
        if(prov)
            return prov;

        return await this.doCreate(id);
    }

    public static async getAll(): Promise<AsyExecutorProvider[]> {
        await this.checkDates();
        const promises = Object.keys(this.provs).map(this.get.bind(this));
        return Promise.all(promises);
    }

    private static async getDates(): Promise<ProviderDates>{
        const provs = await Provider.findAll({attributes: ['id', 'updatedAt']});
        const ret: ProviderDates = {
            provs: {},
            lastModified: 0
        }

        for(let p of provs){
            const tm = +p.updatedAt;
            if(tm > ret.lastModified)
                ret.lastModified = tm;
            ret.provs[p.id] = tm;
        }

        return ret;
    }

    public isRemote(): boolean {
        return this.provider.isRemote();
    }

}