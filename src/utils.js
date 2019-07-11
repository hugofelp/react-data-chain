import stage from './stageEnum.js'

// returns { store, data, dependencies } and the result of mapParameters related to a definition
export function getConditionsParameters( definition, store, status, cache ) {

    if ( cache && cache[ definition.__meta.id ] ){
        return cache[ definition.__meta.id ]
    }

    const dependenciesObject = getDependenciesObject( definition )
    const dependenciesData = formatConsumableData( dependenciesObject, store, status )
    const thisData = formatConsumableData( { data: definition }, store, status )
    const rawParameters = {
        store: store[ definition.__meta.storeId ],
        data: thisData.data,
        dependencies: dependenciesData
    }
    return {
        raw: rawParameters,
        mapped: definition.__meta.mapParameters ? definition.__meta.mapParameters( rawParameters ) : rawParameters
    }
}

export function formatConsumableData( dependenciesObject = {}, store, status ) {
    return Object.keys( dependenciesObject ).reduce( ( formattedData, dependencyKey ) => {
        const definition =  dependenciesObject[ dependencyKey ]
        const def = definition.__meta
        const storeData = store[ def.storeId ]
        const defStatus = status[ def.id ] || stage.WAITING
        const recursiveDependenciesObject = getDependenciesObject( dependenciesObject[ dependencyKey ] )
        const recursiveDependenciesData = formatConsumableData( recursiveDependenciesObject, store, status )

        const selectedData = def.mapData ? def.mapData( { store: storeData, dependencies: recursiveDependenciesData } ) : storeData
        return objectAssignPath( formattedData, dependencyKey, {
            status: defStatus,
            value: selectedData
        } )
    }, {} )
}

// get definitions that have a fetcher AND are referenced by a subscriber
export function getActiveDefinitions( subscriptions, definitions ) {
    return subscriptions.reduce( ( activeDefinitions, sub ) => {
        if ( !activeDefinitions.some( definition => definition.__meta.id === sub.definitionId ) ) {
            activeDefinitions.push( definitions[ sub.definitionId ] )
        }
        return activeDefinitions
    }, [] )
}

// accept dependencies defined as object or function=>object. Always returns an object
export function getDependenciesObject( definition ) {
    const dependenciesDefinition = definition.__meta.dependencies
    if ( !dependenciesDefinition ) { return {} }
    return dependenciesDefinition instanceof Function ? dependenciesDefinition() : dependenciesDefinition
}

export function getDependenciesDefinitions( definition ) {
    const dependencies = getDependenciesObject( definition )
    return Object.keys( dependencies ).reduce( ( allDependencies, depKey ) => {
        return allDependencies.concat( dependencies[ depKey ], getDependenciesDefinitions( dependencies[ depKey ] ) )
    }, [] )
}

export function getInvalidDefinitions( definitions, store, status ) {
    let orderedByDependencyChain = []
    while ( definitions.length > orderedByDependencyChain.length ) {
        definitions.forEach( definition => {
            if ( orderedByDependencyChain.indexOf( definition ) !== -1 ) {
                return
            }
            const dependencies = getDependenciesDefinitions( definition )
            if ( dependencies.length === 0 || dependencies.every( dep => orderedByDependencyChain.indexOf( dep ) !== -1 ) ) {
                orderedByDependencyChain.push( definition )
            }
        } )
    }
    return orderedByDependencyChain.reduce( ( invalidOnes, definition ) => {
        // if any dependency has already been flagged as invalid, this definition is indirectly invalid
        const defDependencies = getDependenciesDefinitions( definition )
        if ( defDependencies.some( dep => invalidOnes.indexOf( dep ) !== -1 ) ) {
            invalidOnes.push( definition )
            return invalidOnes
        }
        // skip check if any operation is already being performed
        if ( status[ definition.__meta.id ] !== stage.IDLE ) {
            return invalidOnes
        }

        const parameters = getConditionsParameters( definition, store, status )
        const isDataAvailable = definition.__meta.isDataAvailable( parameters.mapped, parameters.raw )
        if ( !isDataAvailable ) {
            invalidOnes.push( definition )
        }
        return invalidOnes

    }, [] )
}

// Takes an object and a string path e.g.: 'path.to.value',
// and assigns a value to that path, without changing other properties,
// creating the path if not present. Does not change the original object.
export function objectAssignPath( originalObject, path, value ) {
    const pathSteps = path.split( '.' )
    return pathSteps.reduce( ( obj, key, index ) => {
        let lastObj = obj
        for ( let i = 0; i < index; i++ ) {
            lastObj = lastObj[ pathSteps[ i ] ]
        }

        lastObj[ key ] = index === pathSteps.length - 1
            ? value
            : Object.assign( {}, lastObj[ key ] )

        return obj
    }, Object.assign( {}, originalObject ) )
}

export function addSubscriptionToState( state, componentId, definition ) {
    const definitionId = definition.__meta.id
    return {
        subscriptions: state.subscriptions.concat( { definitionId, subscriberId: componentId } ),
        definitions: !state.definitions[ definitionId ]
            ? Object.assign( { [ definitionId ]: definition }, state.definitions )
            :  state.definitions,
        status: !state.status[ definitionId ]
            ? Object.assign( { [ definitionId ]: stage.WAITING }, state.status )
            : state.status
    }
}

export function removeSuscriptionFromState( state, subscriberId, definition ) {
    return {
        subscriptions: state.subscriptions.filter(
            sub => !( sub.definitionId === definition.__meta.id && sub.subscriberId === subscriberId )
        )
    }
}


// // recursively get all definitions that depend upon the provided dependencies
// export function getRelatedDefinitions( definitions, rootDependencies ) {
//     const related = definitions.filter( definition => {
//         // if already in the list, skip
//         if ( rootDependencies.indexOf( definition ) !== -1 ) {
//             return false
//         }
//         // add definitions that depend on incoming definitions
//         const defDependencies = getDependenciesDefinitions( definition )
//         if ( defDependencies.length === 0 || defDependencies.every( dep => rootDependencies.indexOf( dep ) === -1 ) ) {
//             return false
//         }
//         return true
//     } )
//     // if no new dependency was added, return input, otherwise recurse
//     return related.length === 0 ? rootDependencies : getRelatedDefinitions( definitions, rootDependencies.concat( related ) )
// }
