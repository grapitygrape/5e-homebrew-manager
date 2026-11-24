import { setFs } from '$lib/fs';
import { setConfigProvider } from '$lib/services/config';
import { nodeFsAdapter } from '../node-fs';
import { nodeConfigProvider } from '../config-store';

setFs(nodeFsAdapter);
setConfigProvider(nodeConfigProvider);
