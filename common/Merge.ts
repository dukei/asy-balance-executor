export type MergedObject = {
    [name: string]: any
};

function isObject ( obj: any ) {
    return obj && typeof(obj) === 'object' && !Array.isArray(obj);
}

export default class Merge {
    public static merge(optionBase: MergedObject, optionNew: MergedObject){
        for (let option in optionNew) {
            let val = optionNew[option];
            if (val === null) {
                delete optionBase[option];
            } else if (optionBase[option] === undefined || !isObject(val)) {
                if(!isObject(val)) {
                    optionBase[option] = val;
                }else{
                    let v = optionBase[option];
                    if(!isObject(v))
                        v = {};
                    optionBase[option] = v;
                    Merge.merge(v, val);
                }
            } else {
                Merge.merge(optionBase[option], val);
            }
        }
    }
}