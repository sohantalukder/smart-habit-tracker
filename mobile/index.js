/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import App from './src';
import BackgroundFetch from 'react-native-background-fetch';
import { backgroundFetchHeadlessTask } from './src/sync/lifecycle';

AppRegistry.registerComponent(appName, () => App);
BackgroundFetch.registerHeadlessTask(backgroundFetchHeadlessTask);
