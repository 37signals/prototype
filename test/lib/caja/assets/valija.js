// Copyright (C) 2007 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview the Valija runtime library.
 * <p>
 * This file is written in Cajita and requires the portions of
 * caja.js relevant to Cajita. It additionally depends on one
 * container-provided import, "<tt>loader</tt>", which this file calls
 * as <tt>loader.provide(valija);</tt>. Since this file has the
 * relative path 
 * <tt>com/google/caja/valija-cajita.js</tt>, we assume a POLA loader
 * will associate the provided value
 * <tt>'com.google.caja.valija'</tt>. <tt>loader.provide()</tt> is the
 * strawman <tt>loader.return()</tt> proposed at the bottom of <a href= 
 * "http://google-caja.googlecode.com/svn/trunk/doc/html/cajaModuleSystem/"
 * >Caja Module System</a> but renamed to avoid conflicting with a
 * keyword.
 * <p>
 * The Valija->Cajita translator begins every module with
 * <pre>var valija = loader.require('com.google.caja.valija');</pre>
 * This is distinct from the strawman <tt>loader.load()</tt> proposed
 * at the bottom of <a href=
 * "http://google-caja.googlecode.com/svn/trunk/doc/html/cajaModuleSystem/"
 * >Caja Module System</a>, in that each loaded module is instantiated
 * <i>at most once per loading context with imports determined by the
 * container</i>, rather than once per <tt>load()</tt> with imports
 * determined than the importing module.
 * <p>
 * A container can thereby choose to provide multiple module instances
 * access to the same loading context, in which case these instances
 * can communicate with each other. Such module instances jointly form
 * a single plugin. This enables all the modules instances in a single
 * Valija plugin to share the same mutable POE-table state. For Valija,
 * the plugin is thus the only defensible unit of isolation. 
 * <p>
 * Although <tt>valija-cajita.js</tt> is written with the expectation
 * that it and the output by the Valija->Cajita translator will be
 * cajoled, safety aside, this file uncajoled should work with the
 * output of the Valija->Cajita translator, when that output is also
 * not cajoled. 
 * 
 * @author erights@gmail.com
 */

var valija = function() {

  /**
   * A table mapping from <i>function categories</i> to the
   * pseudo-prototype object POE associates with that function
   * category. 
   * <p>
   * We assume a <tt>caja.newTable()</tt> operation that 
   */
  var myPOE = caja.newTable();

  myPOE.set(caja.getFuncCategory(Object), {
    constructor: Object
  });
  
  /** 
   * Handle Valija <tt><i>func</i>.prototype</tt>.
   * <p>
   * If <tt>func</tt> is a genuine function, return its associated POE
   * pseudo-prototype, creating it (and its parent pseudo-prototypes)
   * if needed. Otherwise as normal.
   */
  function getPrototypeOf(func) {
    if (typeof func === 'function') {
      var cat = caja.getFuncCategory(func);
      var result = myPOE.get(cat);
      if (undefined === result) {
	var parent = getPrototypeOf(caja.getSuperCtor(func));
	result = caja.beget(parent);
	myPOE.set(cat, result);
      }
      return result;
    } else {
      return func.prototype;
    }
  }
  
  /** 
   * Handle Valija <tt><i>func</i>.prototype = <i>newProto</i></tt>.
   * <p>
   * If <tt>func</tt> is a genuine function, set its associated POE
   * pseudo-prototype. Otherwise as normal.
   */
  function setPrototypeOf(func, newProto) {
    if (typeof func === 'function') {
      myPOE.set(caja.getFuncCategory(func), newProto);
      return newProto;
    } else {
      return func.prototype = newProto;
    }
  }

  /** 
   * Handle Valija <tt>typeof <i>obj</i></tt>.
   * <p>
   * If <tt>obj</tt> duck types as a disfunction, then return
   * 'function'. Otherwise as normal.
   */
  function typeOf(obj) {
    var result = typeof obj;
    if (result !== 'object') { return result; }
    if (null === obj) { return result; }
    if (typeof obj.call === 'function') { return 'function'; }
    return result;
  }
  
  /** 
   * Handle Valija <tt><i>obj</i> instanceof <i>func</i></tt>.
   * <p>
   * If <tt>func</tt> is a genuine function, then test whether
   * <tt>obj</tt> inherits from either <tt>func.prototype</tt> or
   * <tt>func</tt>'s POE pseudo-prototype. Otherwise tests if <obj>
   * inherits from <tt>func.prototype</tt>.
   */
  function instanceOf(obj, func) {
    if (typeof func === 'function' && obj instanceof func) {
      return true;
    } else {
      return caja.inheritsFrom(obj, getPrototypeOf(func));
    }
  }

  /**
   * Handle Valija <tt><i>obj</i>[<i>name</i>]</tt>.
   * <p>
   */
  function read(obj, name) {
    if (name in obj) {
      return obj[name];
    }
    if (typeof obj === 'function') {
      return DisfunctionPrototype[name];
    }
    // TODO(erights): I suspect read(obj,'constructor') isn't good
    // enough. Does caja.js need to expose ___.directConstructor() as
    // caja.directConstructor()? 
    var ctor = read(obj, 'constructor');
    return getPrototypeOf(ctor)[name];
  }

  /** 
   * Handle Valija <tt><i>func</i>(<i>args...</i>)</tt>.
   * <p>
   */
  function callFunc(func, args) {
    return func.apply(caja.USELESS, args);
  }

  /** 
   * Handle Valija <tt><i>obj</i>[<i>name</i>](<i>args...</i>)</tt>.
   * <p>
   */
  function callMethod(obj, name, args) {
    return read(obj, name).apply(obj, args);
  }

  /** 
   * Handle Valija <tt>new <i>ctor</i>(<i>args...</i>)</tt>.
   * <p>
   */
  function construct(ctor, args) {
    if (typeof ctor === 'function') {
      return caja.construct(ctor, args);
    }
    var result = caja.beget(ctor.prototype);
    var altResult = ctor.apply(result, args);
    switch (typeof altResult) {
      case 'object': {
	if (null !== altResult) { return altResult; }
      }
      case 'function': {
	return altResult;
      }
    }
    return result;
  }
  
  /**
   * Simulates a monkey-patchable <tt>Function.prototype</tt>.
   * <p>
   * Currently the call(), apply(), and bind() methods are
   * genuine functions on each Disfunction instance, rather being
   * disfunctions inherited from DisfunctionPrototype. This is needed
   * for call() and apply(), but bind() could probably become an
   * inherited disfunction. 
   */
  var DisfunctionPrototype = {};

  /** 
   * Handle Valija <tt>function <i>opt_name</i>(...){...}</tt>.
   * <p>
   */
  function dis(callFn, opt_name) {
    caja.enforceType(callFn, 'function');

    var result = {
      call: callFn,
      apply: function(self, args) {
	return callFn.apply(caja.USELESS, [self].concat(args));
      },
      bind: function(self, var_args) {
	var leftArgs = Array.slice(arguments, 0);
	return function(var_args) {
          return callFn.apply(caja.USELESS, 
			      leftArgs.concat(Array.slice(arguments, 0)));
	};
      },
      prototype: caja.beget(DisfunctionPrototype),
      length: callFn.length -1
    };
    result.prototype.constructor = result;
    if (opt_name !== undefined) {
      result.name = opt_name;
    }
    return result;
  }

  var Disfunction = dis(
    function(var_args) {
      caja.fail("Can't yet create brand new Valija functions");
    }, 
    'Function');
  Disfunction.prototype = DisfunctionPrototype;
  DisfunctionPrototype.constructor = Disfunction;

  return caja.freeze({
    getPrototypeOf: getPrototypeOf,
    setPrototypeOf: setPrototypeOf,
    typeOf: typeOf,
    instanceOf: instanceOf,

    callFunc: callFunc,
    callMethod: callMethod,
    construct: construct,

    dis: dis,
    Disfunction: Disfunction
  });
}();

if (typeof loader !== 'undefined') {
  loader.provide('com.google.caja.valija',valija);
}