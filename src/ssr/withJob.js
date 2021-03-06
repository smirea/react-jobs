/* @flow */
// @see https://github.com/facebook/react/issues/1137

// eslint-disable-next-line import/no-extraneous-dependencies
import React, { PropTypes } from 'react';
import { getDisplayName } from '../utils';
import browserWithJob from '../withJob';
import type { ReactJobsClientContext, ReactJobsServerContext } from './types';

type Context = {
  reactJobsClient: ReactJobsClientContext,
  reactJobsServer?: ReactJobsServerContext,
};

type Options = {
  defer: boolean
};

const defaultOptions = {
  defer: false,
};

const getInitialState = (context, jobID, defer) => {
  const { reactJobsClient, reactJobsServer } = context;

  if (defer) {
    return { completed: false, inProgress: true };
  }

  if (reactJobsServer) {
    // Running on the server. If the jobs have been executed by the runJobs
    // helper then we will get back a result here.
    const jobState = reactJobsServer.getJobState(jobID);
    if (jobState) {
      return jobState;
    }
  } else {
    // Otherwise we have to be on the browser. Check if there is any
    // rehydration state available for this job.
    const ssrRehydrateState = reactJobsClient.popJobRehydrationForSRR(jobID);
    if (ssrRehydrateState) {
      return ssrRehydrateState;
    }
  }

  return undefined;
};

function withSSRBehaviour(WrappedComponent, options) {
  let jobIDHandle = null;

  const { defer } = options || defaultOptions;

  const ComponentWithJobID = (props : Object, context : Context) => {
    const { reactJobsClient, reactJobsServer } = context;

    // Every SSR job should have the client attached in order to provide
    // the identifiers for the components.
    if (!reactJobsClient) {
      throw new Error('You are using an "ssr/job" without having wrapped your component render with the "runJobs" or "rehydrateJobs" helpers.  Please refer to the docs for more details.');
    }

    // Establish a unique identifier for this job instance.
    const getJobID = () => {
      if (!jobIDHandle) {
        jobIDHandle = reactJobsClient.nextJobID();
      }
      return jobIDHandle;
    };
    const jobID = getJobID();

    // Determine if we have an state from server side processing or
    // client side rehdration.
    const initialState = getInitialState(context, jobID, defer);

    // When on a server we want to call back and register the result of the
    // work so that the server can hydrate the app appropriately as well
    // as provide the initial state to be sent to the browser.
    const onJobProcessed = reactJobsServer
      ? jobsState => reactJobsServer.registerJobState(jobID, jobsState)
      : null;

    return (
      <WrappedComponent
        {...props}
        jobInitState={initialState}
        onJobProcessed={onJobProcessed}
      />
    );
  };
  ComponentWithJobID.displayName = `${getDisplayName(WrappedComponent)}WithJobID`;
  ComponentWithJobID.contextTypes = {
    reactJobsClient: PropTypes.object.isRequired,
    reactJobsServer: PropTypes.object,
  };
  return ComponentWithJobID;
}

export default function withJob(work : any, options?: Options) {
  return function wrapComponentWithSSRJob(Component : Function) {
    // We wrap the standard job implementation with our SSR behaviour.
    return withSSRBehaviour(browserWithJob(work)(Component), options);
  };
}
