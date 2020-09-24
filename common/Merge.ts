export type MergedObject = any;

function isObject ( obj: any ): boolean {
    return obj && typeof(obj) === 'object' && !Array.isArray(obj);
}

export default class Merge {
    public static merge(optionBase: MergedObject, optionNew: MergedObject): MergedObject {
        if(optionNew === null)
            return; //undefined

        if(optionNew === undefined)
            return optionBase;

        if(!isObject(optionNew))
            return optionNew;

        if(!isObject(optionBase))
            optionBase = {}

        for (let option in optionNew) {
            let val = optionNew[option];
            if (val === null) {
                delete optionBase[option];
            } else {
                val = Merge.merge(optionBase[option], val);
                optionBase[option] = val;
            }
        }

        return optionBase;
    }

    public static isObject( obj: any) : boolean {
        return isObject(obj)
    }
}