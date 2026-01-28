import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FFlowModule, COMMON_PROVIDERS, FComponentsStore } from '@foblex/flow';
import { FMediator } from '@foblex/mediator';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    FMediator,
    FComponentsStore,
    ...COMMON_PROVIDERS,
    importProvidersFrom(FFlowModule)
  ]
};
