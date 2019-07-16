# react-data-chain

This package provides a declarative way of describing data fetchers for React applications. Instead of going into a saga of dispatching fetchers, the idea is to describe the conditions needed for a certain piece of data to be fetched. Once the conditions are met, `react-data-chain` will execute all the steps necessary, and provide the data to your components.

### Basic Example
For this example we will have a component rendering an avatar, which takes an user name and profile picture. We will define two fetchers. The first one gets the user data, with name and ID. The second fetcher, will depend on the user data, and will fetch the corresponding profile image:
```
import React from 'react'
import { withData, defineDataHandler } from 'react-data-chain'

const definitions = {
    authenticatedUser: defineDataHandler( {
        fetcher: () => fetch( 'my-api/user' ).then( response => response.json() )
    } ),
    userImage: defineDataHandler( {
        dependencies: () => ( {
            user: definitions.authenticatedUser
        } ),
        fetcher: ( { dependencies } ) => fetch( `my-api/profile-image/${dependencies.user.value.id}` ).then( response => response.json() )
    } )
}

function AvatarComponent( props ) {
    if ( !props.userData.value || props.userData.status === 'FETCHING' ) {
        return <Spinner />
    }
    return (
        <div>
            { props.userData.image.value
                ? <ProfileImage url={ props.userData.image.value } />
                : <Spinner />
            }
            <p>{ props.userData.value.name }</p>
        </div>
    )
}

const AvatarWithData = withData( {
    'userData': definitions.authenticatedUser,
    'userData.image': definitions.userImage
} )( AvatarComponent )
```
### Installation
Assuming you are using npm as your package manager:
```
npm install react-data-chain
```
Add the `<DataManager />` to your app. This component will hold the state of your fetchers, and enable `withData` HOC to provide data to your components via React's Context API, so you probably want to define this high up in the hierarchy of your app:
```
import React from 'react'
import ReactDOM from 'react-dom'
import { DataManager } from 'react-data-chain'
import App from './App'

const rootElement = document.getElementById( 'root' )
ReactDOM.render(
    <DataManager>
        <App />
    </DataManager>,
    rootElement
)
```

### Accessing data from your components
`withData` is a Higher Order Component, that will map the results of defined fetchers into your component. Only one fetcher will be created per definition, regardless of how many components are consuming it. Similar to the `connect` function of react-redux, this HOC takes two arguments, the first being a mapping from the stored data to props, and the second maps a writer function that allow you to modify stored data from within your components. Example: 
```
function TodoAppComponent( props ) {
    const addTodo = ( newTodo ) => {
        props.setTodoList( props.todoList.value.concat( newTodo ) )
    }
    return (
        <div>
            <TodoList list={ props.todoList.value } />
            <form onSubmit={ event => { addTodo( todoValueFromEvent( event ) ) } }>
                <input type="text" name="newTodo" />
                <button type="submit">Add todo</button>
            </form>
        </div>
    )
}
const TodosWithData = withData( {
    todoList: definitions.todoListDefinition
}, {
    setTodoList: definitions.todoListDefinition
} )( TodoAppComponent )
```

### Creating definitions
At its simplest form, a definition can be created without any arguments: `const emptyStore = defineDataHandler()`. This will provide an empty data store, and a writer function with access to it. If a fetcher is provided, the definition will then attempt to feed the store with the results of the fetcher. There are several rules you can describe as to when and how a fetcher should be triggered, and also how the resulting data will be reconciled with existing data in store.
##### Reusing fetched data
The conditions to fetch data may change over time, but the result may remain the same. For this example we will fetch a list of teams that a user is part of. When the selected user changes, we need to fetch the teams for the new user, but only teams that are not already available from previous fetch operations:
```
const teamsDefinition = defineDataHandler( {
    fetcher: teamsIds => fetch( `my-api/teams?ids=${teamsIds.join(',')}` ).then( response => response.json() ),
    dependencies: {
        user: userDefinition // assuming this will provide { ...userProps, teamsIds: [...] }
    },
    // return false from this function to trigger the fetcher
    isDataAvailable: teamsIds => teamsIds.length === 0,
    // These are the parameters that will be fed to the fetcher function. Provide only ids that are not available in local data:
    mapParameters: ( { data, dependencies } ) => dependencies.user.value.teamsIds.filter( teamId => !data[ teamId ] ),
    // make sure the fetcher result doesn't replace stored data, but merges instead:
    mapFetcherResponse: ( response, { store } ) => {
        const updatedStore = Object.assign( {}, store )
        response.forEach( team => { updatedStore[ team.id ] = team } )
        return updatedStore
    },
    // This is the actual data that will end up in subscribed components. Select and provide only teams based on the current user:
    mapData: ( { store, dependencies } ) =>  dependencies.user.value && selectTeamsByIds( store, dependencies.user.value.teamsIds )
} )
```

##### Multiple ways of fetching the same type of data
`defineDataHandler` may take a second parameter. As the first parameter describes the main definition, the second can create alternative definitions for reading and writing data to the same store by overriding the main definition's parameters. Say you define a fetcher to get a list of teams. Now, you may need to request a list of teams that a user is part of, or you may get a list of related teams. In both cases, you will want to fetch a list of teams, but based on different parameters. The advantage of creating variations of a definition is that you can share data between them , and in this case, only fetch teams that are not yet available locally:
```
const teamsDefinition = defineDataHandler( {
    fetcher: teamsIds => fetch( `my-api/teams?ids=${teamsIds.join(',')}` ).then( response => response.json() ),
    isDataAvailable: teamsIds => teamsIds.length === 0,
    mapFetcherResponse: ( response, { store } ) => {
        const updatedStore = Object.assign( {}, store )
        response.forEach( team => { updatedStore[ team.id ] = team } )
        return updatedStore
    },
    mapData: ( { store, dependencies } ) =>  dependencies.user.value && selectTeamsByIds( store, dependencies.user.value.teamsIds )
}, {
    userTeams: {
        dependencies: {
            user: userDefinition
        },
        mapParameters: ( { data, dependencies } ) => dependencies.user.value.teamsIds.filter( teamId => !data[ teamId ] ).
        mapData: ( { store, dependencies } ) =>  dependencies.user.value && selectTeamsByIds( store, dependencies.user.value.teamsIds )
    },
    relatedTeams: {
        dependencies: {
            teamDetails: teamDetailsDefinition
        },
        mapParameters: ( { data, dependencies } ) => dependencies.teamDetails.value.relatedTeamsIds.filter( teamId => !data[ teamId ] ).
        mapData: ( { store, dependencies } ) =>  dependencies.teamDetails.value && selectTeamsByIds( store, teamDetails.value.relatedTeamsIds )
    }
} )
```
This will add two keys to your definition, so you can request this data from your components by using:
```
withData( {
    userTeams: teamsDefinition.userTeams,
    relatedTeams: teamsDefinition.relatedTeams
} ) ( Component )
```

##### Refreshing data
By default, no data will be fetched if `isDataAvailable` returns true. You can use `fetcherKey` to force the fetcher to be executed, even if that data is already available. Similar to the key parameter of React components, the fetcherKey will be compared to the previous value, and execute the fetcher everytime a new key is assigned, regardless of previous conditions. In this example, we have a component requesting fresh data after every time it is mounted:
```
const definitions = {
    fetcherData: defineDataHandler(),
    authenticatedUser: defineDataHandler( {
        fetcher: () => fetch( 'my-api/user' ).then( response => response.json() ),
        dependencies: () => ( {
            fetcherData: definitions.fetcherData
        } ),
        fetcherKey: ( { dependencies } ) => dependencies.fetcherData.value && dependencies.fetcherData.value.lastUserRequested
    } )
}
class UserProfile extends React.Component{
    componentDidMount() {
        this.props.setFetcherData( { lastUserRequested: Date.now() } )
    }
    render() {
        // render fresh user data...
    }
}
const UserProfileWithData = withData( {
    userData: definitions.authenticatedUser
}, {
    setFetcherData: definitions.fetcherData
} )( UserProfile )
```

___

## API

This package provides:
```
import { DataManager, withData, defineDataHandler, status } from 'react-data-chain'
```

##### DataManager
`<DataManager />` - React component that takes no parameters. It holds all fecthed data and fetcher status in its state. It ensures the requested fetchers are unique, and shares access to its contents through `withData`, making use of React Context api.

##### withData
`withData( dataMap, writersMap? ):HOC` - function that returns a Higher Order Component. Responsible for injecting fetchers data and write access into a component.
- `dataMap` - Required. Expects an object defining the properties that will be populated with fetcher data in the resulting component. Each object key may be a string, using dots for deep assignment. For example `{ 'deeply.assigned.key': definition }` will result in `props.deeply.assigned.key` being immediatelly available to the resulting component, with an object shaped as `{ value, status }`. Each key should point to a data handler definition instance (created with `defineDataHandler`). 
- `writersMap` - Optional. Expects an object defining the properties that will be populated with writer functions in the resulting component. Each key should point to a definition instance. The resulting component will receive a function for each of the assigned keys, with writing access to the corresponding definition's store.

##### defineDataHandler
`defineDataHandler( baseDefinition?, definitionsOverrides? ):Definition` - function that takes optional fetcher descriptions and returns a data handler definition instance, or instances. From this example:
```
const myDefinition = defineDataHandler( {...}, { subdefinitionA: {...}, subdefinitionB: {...} } )
```
Not only `myDefinition` will be available for referencing from `withData`, but also `myDefinition.subdefinitionA` and `myDefinition.subdefinitionB`. All definition arguments are optional, and every key defined in `definitionOverrides`, will inherit all properties defined in the `baseDefinition`. These are the properties that can be described for each definition.

key | default value | format | desciption
------- | ------- | ------- | -------
mapData  | `store => store` | Function( store, dependencies ):Any | Transforms the data that will be available to requesting parties, including when there is no data in the store. This function is called on every update, and does not wait for dependencies, so you should always check before accessing dependencies' values.
| dependencies | `undefined` | Object OR Function():Object | Just like the first argument of `withData`, this mapping will provide data from other Definitions. It also provides the relationship between definitions, so the execution of fetchers can be done in the correct order, or even revalidated once a dependency is updated.
| mapParameters | `parameters => parameters` | Function( rawParameters ):Any - `rawParameters ` as defined bellow | Called after dependencies are available, and before any other function that takes `mappedParameters`.
| isDataAvailable | `( _, { store } ) => store !== undefined` | Function( mappedParameters, rawParameters ):Boolean | Called on every update after dependencies become available. If false, the definition will be flagged as pending, and the fetching process will be triggered.
fetcher | `undefined` | Function( mappedParameters, rawParameters ):Promise | This function will be called whenever `isDataAvailable` returns false, or a new `fetcherKey` is assigned. The corresponding definition will then receive a status of `FETCHING` until the promise is either resolved or rejected. In case it is resolved, the promise results are then piped into `mapFetcherResponse`. Otherwise an `ERROR` status is assigned, and can only be recovered by assigning a new key.
mapFetcherResponse | `response => response` | Function( fetcherResponse, mappedParameters, rawParameters ):Any | By default, the fetcher response replaces the value of the store. This function provides a way to merge incoming data with the current store. The returned value will replace the value of the corresponding store.

For all the functions above, where `mappedParameters` is provided, it means the result of `mapParameters`, and `rawParameters` consists of the following object:
```
{
    data: {
        value, // the formatted value from the current definition (result of mapData)
        status // the fetcher status, see status enum below
    },
    store, // the raw value of the store, which is shared with subdefinitions
    dependencies // a set of { value, status } of all required dependencies
}
```
##### status
A string enum with the following properties:
```
{
    WAITING,        // One ore more dependencies are pending
    WAITING_INPUT,  // Dependencies are resolved and data is not available, but no fetcher has been provided
    FETCHING,       // Dependencies are resolved, data is not available, fetch in progress
    IDLE,           // Dependencies are resolved anf data is available
    ERROR           // Fetcher promise was rejected
}
```

___

## Compatibility
`react-data-chain` is written in [ES6](https://www.ecma-international.org/ecma-262/6.0/) and is currently compatible with `React ^16.8.0`. It makes use of [hooks](https://reactjs.org/docs/hooks-intro.html), which were introduced in React 16.8.