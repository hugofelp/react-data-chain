export default function defineDataHandler( settings = {}, overrides = {} ) {
    const __meta = Object.assign( {
        id: `definition_${Date.now()}__${Math.random()}`,
        storeId: `store_${Date.now()}__${Math.random()}`,
        isDataAvailable: ( mappedParams, { data } ) => data && data.value !== undefined
    }, settings )
    const overridesArray =  Object.keys( overrides ).map( overrideKey => ( {
        [ overrideKey ]: {
            __meta: Object.assign( {}, __meta, {
                id: `subdefinition_${Date.now()}__${Math.random()}`
            }, overrides[ overrideKey ] )
        }
    } ) )
    return Object.assign( { __meta }, ...overridesArray )
}
