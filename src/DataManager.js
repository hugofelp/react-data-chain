import React from 'react'
import { getActiveDefinitions, getDependenciesDefinitions, getConditionsParameters, addSubscriptionToState, removeSuscriptionFromState, getInvalidDefinitions } from './utils.js'
import stage from './stageEnum.js'


const DataManagerContext = React.createContext()

class DataManager extends React.Component {

    static contextType = DataManagerContext

    static getDerivedStateFromProps( props, state ) {
        const {
            subscriptions,
            definitions,
            store,
            status
        } = state

        // work only with definitions that have at least one subscriber
        const activeDefinitions = getActiveDefinitions( subscriptions, definitions )
        // definitions that depend on an invalid definition, or fail isDataAvailable test are considered invalid
        const invalidDefinitions = getInvalidDefinitions( activeDefinitions, store, status )
        
        // flag invalid definitions as WAITING
        let newStatus = status
        invalidDefinitions.forEach( definition => {
            newStatus =  Object.assign( {}, newStatus, {
                [ definition.__meta.id ]: stage.WAITING
            } )
        } )

        // get all definitions that are WAITING, and check if it's still true (if all dependencies available)
        const queuedDefinitions = activeDefinitions.filter( definition => newStatus[ definition.__meta.id ] === stage.WAITING )
        queuedDefinitions.forEach( definition => {
             const defDependencies = getDependenciesDefinitions( definition )
             // if all dependencies are complete, flag definition as ready to fetch
             if ( defDependencies.length === 0 || defDependencies.every( dep => newStatus[ dep.__meta.id ] === stage.IDLE ) ) {
                newStatus = Object.assign( {}, newStatus, {
                    [ definition.__meta.id ]: definition.__meta.fetcher ? stage.FETCHING : stage.WAITING_INPUT
                } )
             }
        } )

        return newStatus === status ? null : Object.assign( {}, state, { status: newStatus } )
        
    }

    componentDidUpdate( prevProps, prevState ) {
        const {
            subscriptions,
            definitions,
            status,
            store
        } = this.state

        // cache parameters value to avoid unecessary calls
        const paramsCache = {}

        // work only with definitions that have at least one subscriber
        const activeDefinitions = getActiveDefinitions( subscriptions, definitions )

        // check for availability updates of fetcherless definitions
        activeDefinitions.filter( definition => status[ definition.__meta.id ] === stage.WAITING_INPUT ).forEach( definition => {
            const parameters = getConditionsParameters( definition, store, status, paramsCache )
            const isDataAvailable = definition.__meta.isDataAvailable( parameters.mapped, parameters.raw )
            if ( isDataAvailable ) {
                this.setState( state => Object.assign( {}, state, {
                    status: Object.assign( {}, state.status, {
                        [ definition.__meta.id ]: stage.IDLE
                    } )
                } ) )
            }
        } )

        // get definitions that are ready to be fecthed
        const fetchDefinitions = activeDefinitions.filter( definition => {
            if ( status[ definition.__meta.id ] === stage.FETCHING || status[ definition.__meta.id ] === stage.ERROR ) {
                // true if the status just changed...
                if(
                    status[ definition.__meta.id ] === stage.FETCHING
                    && (
                        prevState.status[ definition.__meta.id ] !== stage.ERROR
                        && prevState.status[ definition.__meta.id ] !== stage.FETCHING
                    )
                ){
                    return true
                }
                // ...or if there was an error or fetch in progress, but the fetcher key changed
                if ( definition.__meta.fetcherKey ) {
                    const currentParams = getConditionsParameters( definition, store, status, paramsCache )
                    const oldParams = getConditionsParameters( definition, prevState.store, prevState.status )
                    return definition.__meta.fetcherKey( oldParams.mapped, oldParams.raw ) !== definition.__meta.fetcherKey( currentParams.mapped, currentParams.raw )
                }
            }
            return false
        } )

        // fetch'em
        fetchDefinitions.forEach( definition => {
            
            const parameters = getConditionsParameters( definition, store, status, paramsCache )
            const isDataAvailable = definition.__meta.isDataAvailable( parameters.mapped, parameters.raw )
            
            // available data test may change based on dependencies, so check again
            if ( isDataAvailable ) {
                this.setState( state => Object.assign( {}, state, {
                    status: Object.assign( {}, state.status, {
                        [ definition.__meta.id ]: stage.IDLE
                    } )
                } ) )
            }
            else {
                // if definition has been recovered from an error state, update back to fetching
                if ( status[ definition.__meta.id ] === stage.ERROR ) {
                    this.setState( state => {
                        if ( state.status[ definition.__meta.id ] === stage.ERROR ) {
                            return Object.assign( {}, state, {
                                status: Object.assign( {}, state.status, {
                                    [ definition.__meta.id ]: stage.FETCHING
                                } )
                            } )
                        }
                        return null
                    } )
                }

                // update fetcher key if available
                const fetcherKey = definition.__meta.fetcherKey ? definition.__meta.fetcherKey( parameters.mapped, parameters.raw ) : undefined
                // fetch
                definition.__meta.fetcher( parameters.mapped, parameters.raw ).then(
                    successResponse => {
                        this.setState( state => {
                            // skip handling if status changed
                            if ( state.status[ definition.__meta.id ] !== stage.FETCHING ) {
                                return null
                            }

                            const updatedParameters = getConditionsParameters( definition, state.store, state.status )
                            // skip handling if key changed
                            if ( definition.__meta.fetcherKey && definition.__meta.fetcherKey( updatedParameters.mapped, updatedParameters.raw ) !== fetcherKey ) {
                                return null
                            }
                            const mappedResponse = definition.__meta.mapFetcherResponse
                                ? definition.__meta.mapFetcherResponse( successResponse, updatedParameters.mapped, updatedParameters.raw )
                                : successResponse
                            return Object.assign( {}, state, {
                                store: Object.assign( {}, state.store, {
                                    [ definition.__meta.storeId ]: mappedResponse
                                } ),
                                status: Object.assign( {}, state.status, {
                                    [ definition.__meta.id ]: stage.IDLE
                                } )
                            } )
                        } )
                    },
                    errorResponse => {
                        this.setState( state => Object.assign( {}, state, {
                            status: Object.assign( {}, state.status, {
                                [ definition.__meta.id ]: stage.ERROR
                            } )
                        } ) )
                        throw( errorResponse )
                    }
                )
            }
        } )
    }

    constructor( props ) {
        super( props )
        this._subscriptions = {}
        this.state = {
            store: {},
            definitions: {},
            subscriptions: [],
            status: {},
            
            // static
            setStore: this.setStoreContent.bind( this ),
            subscribe: this.subscribeComponent.bind( this ),
            unsubscribe: this.unsubscribeComponent.bind( this )
        }
    }

    setStoreContent( newData, definition ) {
        this.setState( state => {
            const {
                store
            } = state
            return {
                store: Object.assign( {}, store, {
                    [ definition.__meta.storeId ]: newData
                } )
            }
        } )
    }

    subscribeComponent( subscriberId, definition ) {
        this.setState( state => {
            let updatedState = addSubscriptionToState( state, subscriberId, definition )
            // if definition is being subscribed to for the first time, also subscribe all dependencies
            if ( !state.subscriptions.some( sub => sub.subscriberId === definition.__meta.id ) ) {
                const defDependencies = getDependenciesDefinitions( definition )
                defDependencies.forEach( dependencyDefinition => {
                    updatedState = addSubscriptionToState( updatedState, definition.__meta.id, dependencyDefinition )
                } )
            }
            return updatedState
        } )
    }

    unsubscribeComponent( subscriberId, definition ) {
        this.setState( state => {
            let updatedState = removeSuscriptionFromState( state, subscriberId, definition )
            // if definition has no more subscribers, also unsubscribe all dependencies
            if ( !updatedState.subscriptions.some( sub => sub.definitionId === definition.__meta.id ) ) {
                const defDependencies = getDependenciesDefinitions( definition )
                defDependencies.forEach( dependencyDefinition => {
                    updatedState = removeSuscriptionFromState( updatedState, definition.__meta.id, dependencyDefinition )
                } )
            }
            return updatedState
        } )
    }

    render() {
        return <DataManagerContext.Provider { ...this.props } value={ this.state } />
    }
}

export { DataManagerContext }
export default DataManager
