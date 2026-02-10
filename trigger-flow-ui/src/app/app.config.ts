import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FFlowModule, COMMON_PROVIDERS, FComponentsStore } from '@foblex/flow';
import { FMediator } from '@foblex/mediator';
import { provideHttpClient } from '@angular/common/http';
import { provideAngularSvgIcon } from 'angular-svg-icon';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideAngularSvgIcon(),
    FMediator,
    FComponentsStore,
    ...COMMON_PROVIDERS,
    importProvidersFrom(FFlowModule)
  ]
};
