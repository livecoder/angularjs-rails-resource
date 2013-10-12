(function (undefined) {
    angular.module('rails').factory('railsRootWrappingTransformer', function () {
        return function (data, resource) {
            var result = {};
            result[angular.isArray(data) ? resource.config.pluralName : resource.config.name] = data;
            return result;
        };
    });

    angular.module('rails').factory('railsRootWrappingInterceptor', function () {
        return function (promise) {
            var resource = promise.resource;

            if (!resource) {
                return promise;
            }

            return promise.then(function (response) {
                if (response.data && response.data.hasOwnProperty(resource.config.name)) {
                    response.data = response.data[resource.config.name];
                } else if (response.data && response.data.hasOwnProperty(resource.config.pluralName)) {
                    response.data = response.data[resource.config.pluralName];
                }

                return response;
            });
        };
    });

    angular.module('rails').provider('RailsResource', function () {
        var defaultOptions = {
            rootWrapping: true,
            updateMethod: 'put',
            httpConfig: {},
            defaultParams: undefined
        };

        this.rootWrapping = function (value) {
            defaultOptions.rootWrapping = value;
            return this;
        };

        this.updateMethod = function (value) {
            defaultOptions.updateMethod = value;
            return this;
        };

        this.httpConfig = function (value) {
            defaultOptions.httpConfig = value;
            return this;
        };

        this.defaultParams = function (value) {
            defaultOptions.defaultParams = value;
            return this;
        };

        this.$get = ['$http', '$q', 'railsUrlBuilder', 'railsSerializer', 'railsRootWrappingTransformer', 'railsRootWrappingInterceptor', 'RailsResourceInjector',
            function ($http, $q, railsUrlBuilder, railsSerializer, railsRootWrappingTransformer, railsRootWrappingInterceptor, RailsResourceInjector) {

                function appendPath(url, path) {
                    if (path) {
                        if (path[0] !== '/') {
                            url += '/';
                        }

                        url += path;
                    }

                    return url;
                }

                function forEachDependency(list, callback) {
                    var dependency;

                    for (var i = 0, len = list.length; i < len; i++) {
                        dependency = list[i];

                        if (angular.isString(dependency)) {
                            dependency = list[i] = RailsResourceInjector.getDependency(dependency);
                        }

                        callback(dependency);
                    }
                }

                function RailsResource(value) {
                    var instance = this;
                    if (value) {
                        var immediatePromise = function (data) {
                            return {
                                resource: RailsResource,
                                context: instance,
                                response: data,
                                then: function (callback) {
                                    this.response = callback(this.response, this.resource, this.context);
                                    return immediatePromise(this.response);
                                }
                            }
                        };

                        var data = this.constructor.callInterceptors(immediatePromise({data: value}), this).response.data;
                        angular.extend(this, data);
                    }
                }

                RailsResource.extend = function (child) {
                    // Extend logic copied from CoffeeScript generated code
                    var __hasProp = {}.hasOwnProperty, parent = this;
                    for (var key in parent) {
                        if (__hasProp.call(parent, key)) child[key] = parent[key];
                    }

                    function ctor() {
                        this.constructor = child;
                    }

                    ctor.prototype = parent.prototype;
                    child.prototype = new ctor();
                    child.__super__ = parent.prototype;
                    return child;
                };

                // allow calling configure multiple times to set configuration options and override values from inherited resources
                RailsResource.configure = function (cfg) {
                    cfg = cfg || {};

                    if (this.config) {
                        cfg = angular.extend({}, this.config, cfg);
                    }

                    this.config = {};
                    this.config.url = cfg.url;
                    this.config.rootWrapping = cfg.rootWrapping === undefined ? defaultOptions.rootWrapping : cfg.rootWrapping; // using undefined check because config.rootWrapping || true would be true when config.rootWrapping === false
                    this.config.httpConfig = cfg.httpConfig || defaultOptions.httpConfig;
                    this.config.httpConfig.headers = angular.extend({'Accept': 'application/json', 'Content-Type': 'application/json'}, this.config.httpConfig.headers || {});
                    this.config.defaultParams = cfg.defaultParams || defaultOptions.defaultParams;
                    this.config.updateMethod = (cfg.updateMethod || defaultOptions.updateMethod).toLowerCase();

                    this.config.requestTransformers = cfg.requestTransformers ? cfg.requestTransformers.slice(0) : [];
                    this.config.responseInterceptors = cfg.responseInterceptors ? cfg.responseInterceptors.slice(0) : [];
                    this.config.afterResponseInterceptors = cfg.afterResponseInterceptors ? cfg.afterResponseInterceptors.slice(0) : [];

                    // strings and functions are not considered objects by angular.isObject()
                    if (angular.isObject(cfg.serializer)) {
                        this.config.serializer = cfg.serializer;
                    } else {
                        this.config.serializer = RailsResourceInjector.createService(cfg.serializer || railsSerializer());
                    }

                    this.config.name = this.config.serializer.underscore(cfg.name);
                    this.config.pluralName = this.config.serializer.underscore(cfg.pluralName || this.config.serializer.pluralize(this.config.name));

                    this.config.urlBuilder = railsUrlBuilder(this.config.url);
                    this.config.resourceConstructor = this;
                };

                RailsResource.configure({});

                RailsResource.setUrl = function (url) {
                    this.configure({url: url});
                };

                RailsResource.buildUrl = function (context) {
                    return this.config.urlBuilder(context);
                };

                /**
                 * Add a callback to run on response and construction.
                 * @param fn(response data, constructor, context) - response data is either the resource instance returned or an array of resource instances,
                 *      constructor is the resource class calling the function,
                 *      context is the resource instance of the calling method (create, update, delete) or undefined if the method was a class method (get, query)
                 */
                RailsResource.beforeResponse = function (fn) {
                    fn = RailsResourceInjector.getDependency(fn);
                    this.config.responseInterceptors.push(function (promise) {
                        return promise.then(function (response) {
                            fn(response.data, promise.resource.config.resourceConstructor, promise.context);
                            return response;
                        });
                    });
                };

                /**
                 * Add a callback to run after response has been processed.  These callbacks are not called on object construction.
                 * @param fn(response data, constructor) - response data is either the resource instance returned or an array of resource instances and constructor is the resource class calling the function
                 */
                RailsResource.afterResponse = function (fn) {
                    fn = RailsResourceInjector.getDependency(fn);
                    this.config.afterResponseInterceptors.push(function (promise) {
                        return promise.then(function (response) {
                            fn(response, promise.resource.config.resourceConstructor);
                            return response;
                        });
                    });
                };

                /**
                 * Adds a function to run after serializing the data to send to the server, but before root-wrapping it.
                 * @param fn (data, constructor) - data object is the serialized resource instance, and constructor the resource class calling the function
                 */
                RailsResource.beforeRequest = function (fn) {
                    fn = RailsResourceInjector.getDependency(fn);
                    this.config.requestTransformers.push(function (data, resource) {
                        return fn(data, resource.config.resourceConstructor) || data;
                    });
                };

                // transform data for request:
                RailsResource.transformData = function (data) {
                    var config = this.config;
                    data = config.serializer.serialize(data);

                    forEachDependency(this.config.requestTransformers, function (transformer) {
                        data = transformer(data, config.resourceConstructor);
                    });

                    if (config.rootWrapping) {
                        data = railsRootWrappingTransformer(data, config.resourceConstructor);
                    }

                    return data;
                };

                // transform data on response:
                RailsResource.callInterceptors = function (promise, context) {
                    var config = this.config;

                    promise = promise.then(function (response) {
                        // store off the data in case something (like our root unwrapping) assigns data as a new object
                        response.originalData = response.data;
                        return response;
                    });

                    if (config.rootWrapping) {
                        promise.resource = config.resourceConstructor;
                        promise = railsRootWrappingInterceptor(promise);
                    }

                    promise.then(function (response) {
                        response.data = config.serializer.deserialize(response.data, config.resourceConstructor);
                        return response;
                    });

                    // data is now deserialized. call response interceptors including beforeResponse
                    forEachDependency(config.responseInterceptors, function (interceptor) {
                        promise.resource = config.resourceConstructor;
                        promise.context = context;
                        promise = interceptor(promise);
                    });

                    return promise;
                };

                // transform data after response has been converted to a resource instance:
                RailsResource.callAfterInterceptors = function (promise) {
                    var config = this.config;
                    // data is now deserialized. call response interceptors including afterResponse
                    forEachDependency(config.afterResponseInterceptors, function (interceptor) {
                        promise.resource = config.resourceConstructor;
                        promise = interceptor(promise);
                    });

                    return promise;
                };

                RailsResource.processResponse = function (promise) {
                    promise = this.callInterceptors(promise).then(function (response) {
                        return response.data;
                    });

                    return this.callAfterInterceptors(promise);
                };

                RailsResource.getParameters = function (queryParams) {
                    var params;

                    if (this.config.defaultParams) {
                        params = angular.copy(this.config.defaultParams);
                    }

                    if (angular.isObject(queryParams)) {
                        params = angular.extend(params || {}, queryParams);
                    }

                    return params;
                };

                RailsResource.getHttpConfig = function (queryParams) {
                    var params = this.getParameters(queryParams);

                    if (params) {
                        return angular.extend({params: params}, this.config.httpConfig);
                    }

                    return angular.copy(this.config.httpConfig);
                };

                /**
                 * Returns a URL from the given parameters.  You can override this method on your resource definitions to provide
                 * custom logic for building your URLs or you can utilize the parameterized url strings to substitute values in the
                 * URL string.
                 *
                 * The parameters in the URL string follow the normal Angular binding expression using {{ and }} for the start/end symbols.
                 *
                 * If the context is a number and the URL string does not contain an id parameter then the number is appended
                 * to the URL string.
                 *
                 * If the context is a number and the URL string does
                 * @param context
                 * @param path {string} (optional) An additional path to append to the URL
                 * @return {string}
                 */
                RailsResource.$url = RailsResource.resourceUrl = function (context, path) {
                    if (!angular.isObject(context)) {
                        context = {id: context};
                    }

                    return appendPath(this.buildUrl(context || {}), path);
                };

                RailsResource.$get = function (url, queryParams) {
                    return this.processResponse($http.get(url, this.getHttpConfig(queryParams)));
                };

                RailsResource.query = function (queryParams, context) {
                    return this.$get(this.resourceUrl(context), queryParams);
                };

                RailsResource.get = function (context, queryParams) {
                    return this.$get(this.resourceUrl(context), queryParams);
                };

                /**
                 * Returns the URL for this resource.
                 *
                 * @param path {string} (optional) An additional path to append to the URL
                 * @returns {string} The URL for the resource
                 */
                RailsResource.prototype.$url = function (path) {
                    return appendPath(this.constructor.resourceUrl(this), path);
                };

                RailsResource.prototype.processResponse = function (promise) {
                    promise = this.constructor.callInterceptors(promise, this);

                    promise = promise.then(angular.bind(this, function (response) {
                        // we may not have response data
                        if (response.hasOwnProperty('data') && angular.isObject(response.data)) {
                            angular.extend(this, response.data);
                        }

                        return this;
                    }));

                    return this.constructor.callAfterInterceptors(promise);
                };

                angular.forEach(['post', 'put', 'patch'], function (method) {
                    RailsResource['$' + method] = function (url, data) {
                        var config;
                        // clone so we can manipulate w/o modifying the actual instance
                        data = this.transformData(angular.copy(data, {}));
                        config = angular.extend({method: method, url: url, data: data}, this.getHttpConfig());
                        return this.processResponse($http(config));
                    };

                    RailsResource.prototype['$' + method] = function (url) {
                        var data, config;
                        // clone so we can manipulate w/o modifying the actual instance
                        data = this.constructor.transformData(angular.copy(this, {}));
                        config = angular.extend({method: method, url: url, data: data}, this.constructor.getHttpConfig());
                        return this.processResponse($http(config));

                    };
                });

                RailsResource.prototype.create = function () {
                    return this.$post(this.$url(), this);
                };

                RailsResource.prototype.update = function () {
                    return this['$' + this.constructor.config.updateMethod](this.$url(), this);
                };

                RailsResource.prototype.isNew = function () {
                    return this.id == null;
                };

                RailsResource.prototype.save = function () {
                    if (this.isNew()) {
                        return this.create();
                    } else {
                        return this.update();
                    }
                };

                RailsResource['$delete'] = function (url) {
                    return this.processResponse($http['delete'](url, this.getHttpConfig()));
                };

                RailsResource.prototype['$delete'] = function (url) {
                    return this.processResponse($http['delete'](url, this.constructor.getHttpConfig()));
                };

                //using ['delete'] instead of .delete for IE7/8 compatibility
                RailsResource.prototype.remove = RailsResource.prototype['delete'] = function () {
                    return this.$delete(this.$url());
                };

                return RailsResource;
            }];
    });

    angular.module('rails').factory('railsResourceFactory', ['RailsResource', function (RailsResource) {
        return function (config) {
            function Resource() {
                Resource.__super__.constructor.apply(this, arguments);
            }

            RailsResource.extend(Resource);
            Resource.configure(config);

            return Resource;
        }
    }]);

}());
