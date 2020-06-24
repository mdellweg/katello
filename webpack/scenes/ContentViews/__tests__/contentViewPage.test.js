/* eslint-disable no-useless-escape */
import React from 'react';
import { renderWithRedux, waitFor, fireEvent } from 'react-testing-lib-wrapper';

import CONTENT_VIEWS_KEY from '../ContentViewsConstants';
import { createContentViewsParams } from '../ContentViewsActions';
import ContentViewsPage from '../../ContentViews';
import api from '../../../services/api';
import nock, {
  nockInstance, assertNockRequest, mockAutocomplete, mockSetting,
} from '../../../test-utils/nockWrapper';
import createBasicCVs from './basicContentViews.fixtures';

const cvIndexData = require('./contentViewList.fixtures.json');

const cvIndexPath = api.getApiUrl('/content_views');
const autocompleteUrl = '/content_views/auto_complete_search';
const renderOptions = { namespace: CONTENT_VIEWS_KEY };

let firstCV;
let searchDelayScope;
let autoSearchScope;
beforeEach(() => {
  const { results } = cvIndexData;
  [firstCV] = results;
  searchDelayScope = mockSetting(nockInstance, 'autosearch_delay', 500);
  autoSearchScope = mockSetting(nockInstance, 'autosearch_while_typing', true);
});

afterEach(() => {
  nock.cleanAll();
  assertNockRequest(searchDelayScope);
  assertNockRequest(autoSearchScope);
});

test('Can call API for CVs and show on screen on page load', async (done) => {
  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);

  // Mocking API call with nock so it returns the fixture data
  const scope = nockInstance
    .get(cvIndexPath)
    .query(true)
    .reply(200, cvIndexData);

  // Using a custom rendering function that sets up both redux and react-router.
  // This allows us to use the component as it is normally used
  const { queryByText } = renderWithRedux(<ContentViewsPage />, renderOptions);

  // query* functions will return the element or null if it cannot be found
  // get* functions will return the element or throw an error if it cannot be found
  // Assert that the CV is not showing yet by searching by name and the query returning null
  expect(queryByText(firstCV.name)).toBeNull();
  // Assert that the CV name is now showing on the screen, but wait for it to appear.
  await waitFor(() => expect(queryByText(firstCV.name)).toBeTruthy());
  // Assert request was made and completed, see helper function
  assertNockRequest(autocompleteScope);
  assertNockRequest(scope, done); // Pass jest callback to confirm test is done
});

test('Can handle no Content Views being present', async (done) => {
  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);

  const noResults = {
    total: 0,
    subtotal: 0,
    page: 1,
    per_page: 20,
    results: [],
  };
  const scope = nockInstance
    .get(cvIndexPath)
    .query(true)
    .reply(200, noResults);
  const { queryByText } = renderWithRedux(<ContentViewsPage />, renderOptions);

  expect(queryByText(firstCV.name)).toBeNull();
  await waitFor(() => expect(queryByText(/don't have any Content Views/i)).toBeTruthy());
  assertNockRequest(autocompleteScope);
  assertNockRequest(scope, done);
});

test('Can handle errored response', async (done) => {
  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);
  const scope = nockInstance
    .get(cvIndexPath)
    .query(true)
    .reply(500);

  const { queryByText } = renderWithRedux(<ContentViewsPage />, renderOptions);

  expect(queryByText(firstCV.name)).toBeNull();
  await waitFor(() => expect(queryByText(/unable to connect/i)).toBeTruthy());
  assertNockRequest(autocompleteScope);
  assertNockRequest(scope, done);
});

test('Can handle loading state while request is being made', async (done) => {
  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);
  const scope = nockInstance
    .get(cvIndexPath)
    .delay(2000) // Delay the response so we can check loading state properly
    .query(true)
    .reply(200);

  const { queryByText } = renderWithRedux(<ContentViewsPage />, renderOptions);

  expect(queryByText('Loading')).toBeTruthy();
  assertNockRequest(autocompleteScope);
  assertNockRequest(scope, done);
});

test('Can handle unpublished Content Views', async (done) => {
  const { results } = cvIndexData;
  const unpublishedCVs = results.map(cv => ({ ...cv, last_published: null }));
  const unpublishedCVData = { ...cvIndexData, results: unpublishedCVs };
  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);
  const scope = nockInstance
    .get(cvIndexPath)
    .query(true)
    .reply(200, unpublishedCVData);

  const { getAllByText } = renderWithRedux(<ContentViewsPage />, renderOptions);

  await waitFor(() => expect(getAllByText(/not yet published/i).length).toBeGreaterThan(0));
  assertNockRequest(autocompleteScope);
  assertNockRequest(scope, done);
});

test('Can handle pagination', async (done) => {
  const cvIndexLarge = createBasicCVs(100);
  const { results } = cvIndexLarge;
  const cvIndexFirstPage = { ...cvIndexLarge, ...{ results: results.slice(0, 20) } };
  const cvIndexSecondPage = { ...cvIndexLarge, page: 2, results: results.slice(20, 40) };
  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);

  // Match first page API request
  const firstPageScope = nockInstance
    .get(cvIndexPath)
    .query(createContentViewsParams())
    .reply(200, cvIndexFirstPage);

  // Match second page API request
  const secondPageScope = nockInstance
    .get(cvIndexPath)
    // Using a custom query params matcher because parameters can be strings
    .query(actualQueryObject => parseInt(actualQueryObject.page, 10) === 2)
    .reply(200, cvIndexSecondPage);

  const { queryByText, getByLabelText } = renderWithRedux(<ContentViewsPage />, renderOptions);

  // Wait for first paginated page to load and assert only the first page of results are present
  await waitFor(() => {
    expect(queryByText(results[0].name)).toBeInTheDocument();
    expect(queryByText(results[19].name)).toBeInTheDocument();
    expect(queryByText(results[21].name)).not.toBeInTheDocument();
  });

  // Label comes from patternfly, if this test fails, check if patternfly updated the label.
  expect(getByLabelText('Go to next page')).toBeTruthy();
  getByLabelText('Go to next page').click();

  // Wait for second paginated page to load and assert only the second page of results are present
  await waitFor(() => {
    expect(queryByText(results[20].name)).toBeInTheDocument();
    expect(queryByText(results[39].name)).toBeInTheDocument();
    expect(queryByText(results[41].name)).not.toBeInTheDocument();
  });

  assertNockRequest(autocompleteScope);
  assertNockRequest(firstPageScope);
  assertNockRequest(secondPageScope, done); // Only pass jest callback to the last API request
});

test('Can search for specific Content View', async (done) => {
  const cvname = 'composite one';
  const { results } = cvIndexData;
  const matchQuery = actualParams => actualParams?.search?.includes(cvname);
  const searchResults = {
    ...cvIndexData,
    ...{ total: 1, subtotal: 1, results: results.slice(-1) },
  };

  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);
  const withSearchScope = mockAutocomplete(nockInstance, autocompleteUrl, matchQuery);
  const initialScope = nockInstance
    .get(cvIndexPath)
    .query(true)
    .reply(200, cvIndexData);
  const searchResultScope = nockInstance
    .get(cvIndexPath)
    .query(matchQuery)
    .reply(200, searchResults);

  const {
    getByLabelText,
    getByText,
    queryByText,
  } = renderWithRedux(<ContentViewsPage />, renderOptions);

  await waitFor(() => expect(getByText(firstCV.name)).toBeInTheDocument());

  const searchInput = getByLabelText(/text input for search/i);
  expect(searchInput).toBeInTheDocument();
  fireEvent.change(searchInput, { target: { value: `name = \"${cvname}\"` } });

  await waitFor(() => {
    expect(getByText(cvname)).toBeInTheDocument();
    expect(queryByText(firstCV.name)).not.toBeInTheDocument();
  });

  assertNockRequest(autocompleteScope);
  assertNockRequest(initialScope);
  assertNockRequest(withSearchScope);
  assertNockRequest(searchResultScope, done);
});

test('No results message is shown for empty search', async (done) => {
  const cvname = 'notanactualname';
  const query = `name = \"${cvname}\"`;
  const matchQuery = actualParams => actualParams?.search?.includes(cvname);
  const emptyResults = {
    total: 1, subtotal: 1, page: 1, per_page: 20, search: query, results: [],
  };

  const autocompleteScope = mockAutocomplete(nockInstance, autocompleteUrl);
  const withSearchScope = mockAutocomplete(nockInstance, autocompleteUrl, matchQuery);
  const initialScope = nockInstance
    .get(cvIndexPath)
    .query(true)
    .reply(200, cvIndexData);
  const searchResultScope = nockInstance
    .get(cvIndexPath)
    .query(matchQuery)
    .reply(200, emptyResults);

  const { getByLabelText, getByText } = renderWithRedux(<ContentViewsPage />, renderOptions);

  await waitFor(() => expect(getByText(firstCV.name)).toBeInTheDocument());

  fireEvent.change(getByLabelText(/text input for search/i), { target: { value: query } });

  await waitFor(() => expect(getByText(/No matching Content Views found/i)).toBeInTheDocument());

  assertNockRequest(autocompleteScope);
  assertNockRequest(initialScope);
  assertNockRequest(withSearchScope);
  assertNockRequest(searchResultScope, done);
});
/* eslint-enable no-useless-escape */
