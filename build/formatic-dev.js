!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Formatic=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
// # compiler.choices

/*
Normalizes the choices for a field. Supports the following formats.

```js
'red, blue'

['red', 'blue']

{red: 'Red', blue: 'Blue'}

[{value: 'red', label: 'Red'}, {value: 'blue', label: 'Blue'}]
```

All of those formats are normalized to:

```js
[{value: 'red', label: 'Red'}, {value: 'blue', label: 'Blue'}]
```
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  var util = plugin.require('util');

  var compileChoices = function (choices) {

    // Convert comma separated string to array of strings.
    if (_.isString(choices)) {
      choices = choices.split(',');
    }

    // Convert object to array of objects with `value` and `label` properties.
    if (!_.isArray(choices) && _.isObject(choices)) {
      choices = Object.keys(choices).map(function (key) {
        return {
          value: key,
          label: choices[key]
        };
      });
    }

    // Copy the array of choices so we can manipulate them.
    choices = choices.slice(0);

    // Array of choice arrays should be flattened.
    choices = _.flatten(choices);

    choices.forEach(function (choice, i) {
      // Convert any string choices to objects with `value` and `label`
      // properties.
      if (_.isString(choice)) {
        choices[i] = {
          value: choice,
          label: util.humanize(choice)
        };
      }
      if (!choices[i].label) {
        choices[i].label = util.humanize(choices[i].value);
      }
    });

    return choices;
  };

  plugin.exports.compile = function (def) {
    if (def.choices === '') {
      def.choices = [];
    } else if (def.choices) {

      def.choices = compileChoices(def.choices);
    }

    if (def.replaceChoices === '') {
      def.replaceChoices = [];
    } else if (def.replaceChoices) {

      def.replaceChoices = compileChoices(def.replaceChoices);

      def.replaceChoicesLabels = {};

      def.replaceChoices.forEach(function (choice) {
        def.replaceChoicesLabels[choice.value] = choice.label;
      });
    }
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],2:[function(require,module,exports){
// # compiler.lookup

/*
Convert a lookup declaration to an evaluation. A lookup property is used like:

```js
{
  type: 'string',
  key: 'states',
  lookup: {source: 'locations', keys: ['country']}
}
```

Logically, the above will use the `country` key of the value to ask the
`locations` source for states choices. This works by converting the lookup to
the following evaluation.

```js
{
  type: 'string',
  key: 'states',
  choices: [],
  eval: {
    needsSource: [
      ['@if', ['@getCachedSource', 'locations', {country: ['@get', 'country']}], null, ['locations', {country: ['@get', 'country']}]]
    ],
    choices: ['@getCachedSource', 'locations', {country: ['@get', 'country']}]
  }
}
```

The above says to add a `needsSource` property if necessary and add a `choices`
array if it's available. Otherwise, choices will default to an empty array.
*/

'use strict';

module.exports = function (plugin) {

  var addLookup = function (def, lookupPropName, choicesPropName) {
    var lookup = def[lookupPropName];

    if (lookup) {
      if (!def[choicesPropName]) {
        def[choicesPropName] = [];
      }
      if (!def.eval) {
        def.eval = {};
      }
      if (!def.eval.needsSource) {
        def.eval.needsSource = [];
      }
      if (!def.eval.refreshMeta) {
        def.eval.refreshMeta = [];
      }
      var keys = lookup.keys || [];
      var params = {};
      var metaArgs, metaGet, metaHasError, hiddenTest;

      if (lookup.group) {

        keys.forEach(function (key) {
          params[key] = ['@get', 'item', key];
        });
        metaArgs = [lookup.source].concat(params);
        metaGet = ['@getCachedSource'].concat(metaArgs);
        var metaForEach = ['@forEach', 'item', ['@getGroupValues', lookup.group]];
        def.eval.needsSource.push(metaForEach.concat([
          metaArgs,
          ['@not', metaGet]
        ]));
        hiddenTest = ['@and'].concat(keys.map(function (key) {
          return ['@get', 'item', key];
        }));
        def.eval[choicesPropName] = metaForEach.concat([
          ['@or', metaGet, ['@if', hiddenTest, ['///loading///'], []]],
          ['@or', hiddenTest, metaGet]
        ]);
      } else {
        keys.forEach(function (key) {
          params[key] = ['@get', key];
        });
        metaArgs = [lookup.source].concat(params);
        metaGet = ['@getCachedSource'].concat(metaArgs);
        metaHasError = ['@hasMetaError'].concat(metaArgs);
        var metaGetOrLoading = ['@if', metaHasError, ['///error///'], ['@or', metaGet, ['///loading///']]];
        def.eval.needsSource.push(['@if', metaGet, null, metaArgs]);
        def.eval.refreshMeta.push(metaArgs);
        def.eval[choicesPropName] = metaGetOrLoading;
        if (keys.length > 0) {
          // Test that we have all needed keys.
          hiddenTest = ['@and'].concat(keys.map(function (key) {
            return ['@get', key];
          }));
          // Reverse test so we hide if don't have all keys.
          hiddenTest = ['@not', hiddenTest];
          if (!def.eval.hidden) {
            def.eval.hidden = hiddenTest;
          }
        }
      }

      delete def[lookupPropName];
    }
  };

  plugin.exports.compile = function (def) {

    addLookup(def, 'lookup', 'choices');
    addLookup(def, 'lookupReplacements', 'replaceChoices');
  };
};

},{}],3:[function(require,module,exports){
// # compilers.prop-aliases

/*
Alias some properties to other properties.
*/

'use strict';

module.exports = function (plugin) {

  var propAliases = {
    help_text: 'helpText'
  };

  plugin.exports.compile = function (def) {
    Object.keys(propAliases).forEach(function (alias) {
      var propName = propAliases[alias];
      if (typeof def[propName] === 'undefined' && typeof def[alias] !== 'undefined') {
        def[propName] = def[alias];
      }
    });
  };
};

},{}],4:[function(require,module,exports){
(function (global){
// # compilers.types

/*
Convert some high-level types to low-level types and properties.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  // Map high-level type to low-level type. If a function is supplied, can
  // modify the field definition.
  var typeCoerce = {
    unicode: function (def) {
      def.type = 'string';
      def.maxRows = 1;
    },
    text: 'string',
    select: function (def) {
      def.choices = def.choices || [];
    },
    bool: 'boolean',
    dict: 'object',
    decimal: 'number',
    int: 'number',
    fieldset: function (def) {
      def.type = 'object';
      def.staticKeys = true;
    }
  };

  typeCoerce.str = typeCoerce.unicode;


  plugin.exports.compile = function (def) {

    var coerceType = typeCoerce[def.type];
    if (coerceType) {
      if (_.isString(coerceType)) {
        def.type = coerceType;
      } else if (_.isFunction(coerceType)) {
        def = coerceType(def);
      }
    }
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],5:[function(require,module,exports){
(function (global){
// # component.add-item

/*
The add button to append an item to a field.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className,
        label: plugin.configValue('label', '[add]')
      };
    },

    render: function () {
      return R.span({className: this.props.className, onClick: this.props.onClick}, this.props.label);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],6:[function(require,module,exports){
(function (global){
// # component.checkbox-list

/*
Used with array values to supply multiple checkboxes for adding multiple
enumerated values to an array.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;
var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onChange: function () {
      // Get all the checked checkboxes and convert to an array of values.
      var choiceNodes = this.refs.choices.getDOMNode().getElementsByTagName('input');
      choiceNodes = Array.prototype.slice.call(choiceNodes, 0);
      var values = choiceNodes.map(function (node) {
        return node.checked ? node.value : null;
      }).filter(function (value) {
        return value;
      });
      this.props.field.val(values);
    },

    render: function () {

      var field = this.props.field;

      var choices = field.def.choices || [];

      var isInline = !_.find(choices, function (choice) {
        return choice.sample;
      });

      var value = field.value || [];

      return plugin.component('field')({
        field: field
      },
        R.div({className: this.props.className, ref: 'choices'},
          choices.map(function (choice, i) {

            var inputField = R.span({style: {whiteSpace: 'nowrap'}},
              R.input({
                name: field.def.key,
                type: 'checkbox',
                value: choice.value,
                checked: value.indexOf(choice.value) >= 0 ? true : false,
                onChange: this.onChange
                //onFocus: this.props.actions.focus
              }),
              ' ',
              R.span({className: 'field-choice-label'},
                choice.label
              )
            );

            if (isInline) {
              return R.span({key: i, className: 'field-choice'},
                inputField, ' '
              );
            } else {
              return R.div({key: i, className: 'field-choice'},
                inputField, ' ',
                plugin.component('sample')({field: field, choice: choice})
              );
            }
          }.bind(this))
        )
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],7:[function(require,module,exports){
(function (global){
'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;
var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var CSSTransitionGroup = React.createFactory(React.addons.CSSTransitionGroup);

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    mixins: [
      //plugin.require('mixin.resize'),
      //plugin.require('mixin.scroll'),
      plugin.require('mixin.click-outside')
    ],

    getInitialState: function () {
      return {
        maxHeight: null,
        open: this.props.open
      };
    },
    //
    // onToggle: function () {
    //   this.setState({open: !this.state.open});
    // },
    //
    // onClose: function () {
    //   this.setState({open: false});
    // },
    //
    // fixChoicesWidth: function () {
    //   this.setState({
    //     choicesWidth: this.refs.active.getDOMNode().offsetWidth
    //   });
    // },
    //
    // onResizeWindow: function () {
    //   this.fixChoicesWidth();
    // },

    // componentDidMount: function () {
    //   this.fixChoicesWidth();
    //   this.setOnClickOutside('select', this.onClose);
    // },

    getIgnoreCloseNodes: function () {
      if (!this.props.ignoreCloseNodes) {
        return [];
      }
      var nodes = this.props.ignoreCloseNodes();
      if (!_.isArray(nodes)) {
        nodes = [nodes];
      }
      return nodes;
    },

    componentDidMount: function () {
      this.setOnClickOutside('choices', function (event) {

        // Make sure we don't find any nodes to ignore.
        if (!_.find(this.getIgnoreCloseNodes(), function (node) {
          return this.isNodeInside(event.target, node);
        }.bind(this))) {
          this.props.onClose();
        }
      }.bind(this));

      this.adjustSize();
    },

    onSelect: function (choice) {
      this.props.onSelect(choice.value);
    },

    onResizeWindow: function () {
      this.adjustSize();
    },

    onScrollWindow: function () {
      this.adjustSize();
    },

    adjustSize: function () {
      if (this.refs.choices) {
        var node = this.refs.choices.getDOMNode();
        var rect = node.getBoundingClientRect();
        var top = rect.top;
        var windowHeight = window.innerHeight;
        var height = windowHeight - top;
        this.setState({
          maxHeight: height
        });
      }
    },

    componentWillReceiveProps: function (nextProps) {
      this.setState({open: nextProps.open}, function () {
        this.adjustSize();
      }.bind(this));
    },

    onScroll: function () {
      // console.log('stop that!')
      // event.preventDefault();
      // event.stopPropagation();
    },

    onWheel: function () {
      // event.preventDefault();
      // event.stopPropagation();
    },

    render: function () {

      var choices = this.props.choices;

      if (choices && choices.length === 0) {
        choices = [{value: '///empty///'}];
      }

      return R.div({ref: 'container', onWheel: this.onWheel, onScroll: this.onScroll, className: 'choices-container', style: {
        userSelect: 'none', WebkitUserSelect: 'none', position: 'absolute',
        maxHeight: this.state.maxHeight ? this.state.maxHeight : null
      }},
        CSSTransitionGroup({transitionName: 'reveal'},
          this.props.open ? R.ul({ref: 'choices', className: 'choices'},
            choices.map(function (choice, i) {

              var choiceElement = null;

              if (choice.value === '///loading///') {
                choiceElement = R.a({href: 'JavaScript' + ':', onClick: this.props.onClose},
                  R.span({className: 'choice-label'},
                    'Loading...'
                  )
                );
              } else if (choice.value === '///empty///') {
                choiceElement = R.a({href: 'JavaScript' + ':', onClick: this.props.onClose},
                  R.span({className: 'choice-label'},
                    'No choices available.'
                  )
                );
              } else {
                choiceElement = R.a({href: 'JavaScript' + ':', onClick: this.onSelect.bind(this, choice)},
                  R.span({className: 'choice-label'},
                    choice.label
                  ),
                  R.span({className: 'choice-sample'},
                    choice.sample
                  )
                );
              }

              return R.li({key: i, className: 'choice'},
                choiceElement
              );
            }.bind(this))
          ) : null
        )
      );


      // var className = formatic.className('dropdown-field', plugin.config.className, this.props.field.className);
      //
      // var selectedLabel = '';
      // var matchingLabels = this.props.field.choices.filter(function (choice) {
      //   return choice.value === this.props.field.value;
      // }.bind(this));
      // if (matchingLabels.length > 0) {
      //   selectedLabel = matchingLabels[0].label;
      // }
      // selectedLabel = selectedLabel || '\u00a0';
      //
      // return R.div(_.extend({className: className, ref: 'select'}, plugin.config.attributes),
      //   R.div({className: 'field-value', ref: 'active', onClick: this.onToggle}, selectedLabel),
      //   R.div({className: 'field-toggle ' + (this.state.open ? 'field-open' : 'field-closed'), onClick: this.onToggle}),
      //   React.addons.CSSTransitionGroup({transitionName: 'reveal'},
      //     R.div({className: 'field-choices-container'},
      //       this.state.open ? R.ul({ref: 'choices', className: 'field-choices', style: {width: this.state.choicesWidth}},
      //         this.props.field.choices.map(function (choice) {
      //           return R.li({
      //             className: 'field-choice',
      //             onClick: function () {
      //               this.setState({open: false});
      //               this.props.form.actions.change(this.props.field, choice.value);
      //             }.bind(this)
      //           }, choice.label);
      //         }.bind(this))
      //       ) : []
      //     )
      //   )
      // );
    }
  });
};


// componentDidMount: function () {
//   this.setOnClickOutside('choices', function (event) {
//
//     // Make sure we don't find any nodes to ignore.
//     if (!_.find(this.getIgnoreCloseNodes(), function (node) {
//       console.log(node, event.target)
//       return !this.isNodeOutside(node, event.target);
//     }.bind(this))) {
//       console.log("how???")
//       this.props.onClose();
//     }
//   }.bind(this));
// },
//
// onSelect: function (choice) {
//   this.props.onSelect(choice.value);
// },
//
// render: function () {
//
//   return R.div({ref: 'container', className: 'choices-container', style: {userSelect: 'none', WebkitUserSelect: 'none', position: 'absolute'}},
//     this.props.open ?
//       CSSTransitionGroup({transitionName: 'reveal'},
//         R.ul({ref: 'choices', className: 'choices'},
//           this.props.choices.map(function (choice, i) {
//             return R.li({key: i, className: 'choice'},
//               R.a({href: 'JavaScript:' + '', onClick: this.onSelect.bind(this, choice)},
//                 R.span({className: 'choice-label'},
//                   choice.label
//                 ),
//                 R.span({className: 'choice-sample'},
//                   choice.sample
//                 )
//               )
//             );
//           }.bind(this))
//         )
//       )
//       : null
//   );

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],8:[function(require,module,exports){
(function (global){
// # component.field

/*
Used by any fields to put the label and help text around the field.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;
var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var CSSTransitionGroup = React.createFactory(React.addons.CSSTransitionGroup);

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    getInitialState: function () {
      return {
        collapsed: this.props.field.def.collapsed ? true : false
      };
    },

    isCollapsible: function () {
      var field = this.props.field;

      return !_.isUndefined(field.def.collapsed) || !_.isUndefined(field.def.collapsible);
    },

    onClickLabel: function () {
      this.setState({
        collapsed: !this.state.collapsed
      });
    },

    render: function () {

      if (this.props.plain) {
        return this.props.children;
      }

      var field = this.props.field;

      var index = this.props.index;
      if (!_.isNumber(index)) {
        index = _.isNumber(field.def.key) ? field.def.key : undefined;
      }

      return R.div({className: this.props.className, style: {display: (field.hidden() ? 'none' : '')}},
        plugin.component('label')({field: field, index: index, onClick: this.isCollapsible() ? this.onClickLabel : null}),
        CSSTransitionGroup({transitionName: 'reveal'},
          this.state.collapsed ? [] : [
            plugin.component('help')({key: 'help', field: field}),
            this.props.children
          ]
        )
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],9:[function(require,module,exports){
(function (global){
// # component.fieldset

/*
Render multiple child fields for a field.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    render: function () {
      var field = this.props.field;

      return plugin.component('field')({
        field: field, plain: this.props.plain
      },
        R.fieldset({className: this.props.className},
          field.fields().map(function (field, i) {
            return field.component({key: field.def.key || i, onFocus: this.props.onFocus, onBlur: this.props.onBlur});
          }.bind(this))
        )
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],10:[function(require,module,exports){
(function (global){
// # component.help

/*
Just the help text block.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    render: function () {

      var field = this.props.field;

      return field.def.helpText ?
        R.div({className: this.props.className},
          field.def.helpText
        ) :
        R.span(null);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],11:[function(require,module,exports){
(function (global){
// # component.item-choices

/*
Give a list of choices of item types to create as children of an field.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onChange: function (event) {
      this.props.onSelect(parseInt(event.target.value));
    },

    render: function () {

      var field = this.props.field;

      var typeChoices = null;
      if (field.items().length > 1) {
        typeChoices = R.select({className: this.props.className, value: this.value, onChange: this.onChange},
          field.items().map(function (item, i) {
            return R.option({key: i, value: i}, item.label || i);
          })
        );
      }

      return typeChoices ? typeChoices : R.span(null);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],12:[function(require,module,exports){
(function (global){
// # component.json

/*
Textarea editor for JSON. Will validate the JSON before setting the value, so
while the value is invalid, no external state changes will occur.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className,
        rows: plugin.config.rows || 5
      };
    },

    isValidValue: function (value) {

      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        return false;
      }
    },

    getInitialState: function () {
      return {
        isValid: true,
        value: JSON.stringify(this.props.field.value, null, 2)
      };
    },

    onChange: function (event) {
      var isValid = this.isValidValue(event.target.value);

      if (isValid) {
        // Need to handle this better. Need to track position.
        this._isChanging = true;
        this.props.field.val(JSON.parse(event.target.value));
      }

      this.setState({
        isValid: isValid,
        value: event.target.value
      });
    },

    componentWillReceiveProps: function (nextProps) {
      if (!this._isChanging) {
        this.setState({
          isValid: true,
          value: JSON.stringify(nextProps.field.value, null, 2)
        });
      }
      this._isChanging = false;
    },

    render: function () {

      var field = this.props.field;

      return plugin.component('field')({
        field: field, plain: this.props.plain
      }, R.textarea({
          className: this.props.className,
          value: this.state.value,
          onChange: this.onChange,
          style: {backgroundColor: this.state.isValid ? '' : 'rgb(255,200,200)'},
          rows: field.def.rows || this.props.rows,
          onFocus: this.onFocus,
          onBlur: this.onBlur
        })
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],13:[function(require,module,exports){
(function (global){
// # component.label

/*
Just the label for a field.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    render: function () {

      var field = this.props.field;

      var label = null;
      if (typeof this.props.index === 'number') {
        label = '' + (this.props.index + 1) + '.';
        if (field.def.label) {
          label = label + ' ' + field.def.label;
        }
      }

      if (field.def.label || label) {
        var text = label || field.def.label;
        if (this.props.onClick) {
          text = R.a({href: 'JavaScript' + ':', onClick: this.props.onClick}, text);
        }
        label = R.label({}, text);
      }

      var required = R.span({className: 'required-text'});

      return R.div({
        className: this.props.className
      },
        label,
        ' ',
        required
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],14:[function(require,module,exports){
(function (global){
// # component.list-control

/*
Render the item type choices and the add button.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    getInitialState: function () {
      return {
        itemIndex: 0
      };
    },

    onSelect: function (index) {
      this.setState({
        itemIndex: index
      });
    },

    onAppend: function () {
      this.props.onAppend(this.state.itemIndex);
    },

    render: function () {

      var field = this.props.field;

      var typeChoices = null;

      if (field.items().length > 0) {
        typeChoices = plugin.component('item-choices')({field: field, value: this.state.itemIndex, onSelect: this.onSelect});
      }

      return R.div({className: this.props.className},
        typeChoices, ' ',
        plugin.component('add-item')({onClick: this.onAppend})
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],15:[function(require,module,exports){
(function (global){
// # component.list-item-control

/*
Render the remove and move buttons for a field.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onMoveBack: function () {
      this.props.onMove(this.props.index, this.props.index - 1);
    },

    onMoveForward: function () {
      this.props.onMove(this.props.index, this.props.index + 1);
    },

    onRemove: function () {
      this.props.onRemove(this.props.index);
    },

    render: function () {
      var field = this.props.field;

      return R.div({className: this.props.className},
        plugin.component('remove-item')({field: field, onClick: this.onRemove}),
        this.props.index > 0 ? plugin.component('move-item-back')({onClick: this.onMoveBack}) : null,
        this.props.index < (this.props.numItems - 1) ? plugin.component('move-item-forward')({onClick: this.onMoveForward}) : null
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],16:[function(require,module,exports){
(function (global){
// # component.list-item-value

/*
Render the value of a list item.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    render: function () {
      var field = this.props.field;

      return R.div({className: this.props.className},
        field.component()
        // plugin.component('field')({
        //   field: field,
        //   index: this.props.index
        // },
        //   field.component()
        // )
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],17:[function(require,module,exports){
(function (global){
// # component.list-item

/*
Render a list item.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    render: function () {
      var field = this.props.field;

      return R.div({className: this.props.className},
        plugin.component('list-item-value')({form: this.props.form, field: field, index: this.props.index}),
        plugin.component('list-item-control')({field: field, index: this.props.index, numItems: this.props.numItems, onMove: this.props.onMove, onRemove: this.props.onRemove})
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],18:[function(require,module,exports){
(function (global){
// # component.list

/*
Render a list.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

var CSSTransitionGroup = React.createFactory(React.addons.CSSTransitionGroup);

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    nextLookupId: 0,

    getInitialState: function () {

      // Need to create artificial keys for the array. Indexes are not good keys,
      // since they change. So, map each position to an artificial key
      var lookups = [];
      this.props.field.fields().forEach(function (field, i) {
        lookups[i] = '_' + this.nextLookupId;
        this.nextLookupId++;
      }.bind(this));

      return {
        lookups: lookups
      };
    },

    componentWillReceiveProps: function (newProps) {

      var lookups = this.state.lookups;
      var fields = newProps.field.fields();

      // Need to set artificial keys for new array items.
      if (fields.length > lookups.length) {
        for (var i = lookups.length; i < fields.length; i++) {
          lookups[i] = '_' + this.nextLookupId;
          this.nextLookupId++;
        }
      }

      this.setState({
        lookups: lookups
      });
    },

    onAppend: function (itemIndex) {
      this.props.field.append(itemIndex);
    },
    //
    // onClickLabel: function (i) {
    //   if (this.props.field.collapsableItems) {
    //     var collapsed;
    //     // if (!this.state.collapsed[i]) {
    //     //   collapsed = this.state.collapsed;
    //     //   collapsed[i] = true;
    //     //   this.setState({collapsed: collapsed});
    //     // } else {
    //     //   collapsed = this.props.field.fields.map(function () {
    //     //     return true;
    //     //   });
    //     //   collapsed[i] = false;
    //     //   this.setState({collapsed: collapsed});
    //     // }
    //     collapsed = this.state.collapsed;
    //     collapsed[i] = !collapsed[i];
    //     this.setState({collapsed: collapsed});
    //   }
    // },
    //
    onRemove: function (i) {
      var lookups = this.state.lookups;
      lookups.splice(i, 1);
      this.setState({
        lookups: lookups
      });
      this.props.field.remove(i);
    },
    //
    onMove: function (fromIndex, toIndex) {
      var lookups = this.state.lookups;
      var fromId = lookups[fromIndex];
      var toId = lookups[toIndex];
      lookups[fromIndex] = toId;
      lookups[toIndex] = fromId;
      this.setState({
        lookups: lookups
      });
      this.props.field.move(fromIndex, toIndex);
    },

    render: function () {

      var field = this.props.field;
      var fields = field.fields();

      var numItems = fields.length;
      return plugin.component('field')({
        field: field, plain: this.props.plain
      },
        R.div({className: this.props.className},
          CSSTransitionGroup({transitionName: 'reveal'},
            fields.map(function (child, i) {
              return plugin.component('list-item')({
                key: this.state.lookups[i],
                form: this.props.form,
                field: child,
                parent: field,
                index: i,
                numItems: numItems,
                onMove: this.onMove,
                onRemove: this.onRemove
              });
            }.bind(this))
          ),
          plugin.component('list-control')({field: field, onAppend: this.onAppend})
        )
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],19:[function(require,module,exports){
(function (global){
// # component.move-item-back

/*
Button to move an item backwards in list.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className,
        label: plugin.configValue('label', '[up]')
      };
    },

    render: function () {
      return R.span({className: this.props.className, onClick: this.props.onClick}, this.props.label);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],20:[function(require,module,exports){
(function (global){
// # component.move-item-forward

/*
Button to move an item forward in a list.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className,
        label: plugin.configValue('label', '[down]')
      };
    },

    render: function () {
      return R.span({className: this.props.className, onClick: this.props.onClick}, this.props.label);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],21:[function(require,module,exports){
(function (global){
// # component.object-control

/*
Render the item type choices and the add button.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    getInitialState: function () {
      return {
        itemIndex: 0
      };
    },

    onSelect: function (index) {
      this.setState({
        itemIndex: index
      });
    },

    onAppend: function () {
      this.props.onAppend(this.state.itemIndex);
    },

    render: function () {

      var field = this.props.field;

      var typeChoices = null;

      if (field.items().length > 0) {
        typeChoices = plugin.component('item-choices')({field: field, value: this.state.itemIndex, onSelect: this.onSelect});
      }

      return R.div({className: this.props.className},
        typeChoices, ' ',
        plugin.component('add-item')({onClick: this.onAppend})
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],22:[function(require,module,exports){
(function (global){
// # component.object-item-control

/*
Render the remove buttons for an object item.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onRemove: function () {
      this.props.onRemove(this.props.field.def.key);
    },

    render: function () {
      var field = this.props.field;

      return R.div({className: this.props.className},
        plugin.component('remove-item')({field: field, onClick: this.onRemove})
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],23:[function(require,module,exports){
(function (global){
// # component.object-item-key

/*
Render an object item key editor.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;
var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onChange: function (event) {
      this.props.onChange(event.target.value);
    },

    render: function () {
      var field = this.props.field;

      var key = field.def.key;

      if (!_.isUndefined(this.props.tempKey)) {
        key = this.props.tempKey;
      }

      return R.input({className: this.props.className, type: 'text', value: key, onChange: this.onChange});
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],24:[function(require,module,exports){
(function (global){
// # component.object-item-value

/*
Render the value of an object item.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    render: function () {
      var field = this.props.field;

      return R.div({className: this.props.className},
        field.component({plain: true})
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],25:[function(require,module,exports){
(function (global){
// # component.object-item

/*
Render an object item.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onChangeKey: function (newKey) {
      this.props.onMove(this.props.field.def.key, newKey);
    },

    render: function () {
      var field = this.props.field;

      return R.div({className: this.props.className},
        plugin.component('object-item-key')({form: this.props.form, field: field, onChange: this.onChangeKey, tempKey: this.props.tempKey}),
        plugin.component('object-item-value')({form: this.props.form, field: field}),
        plugin.component('object-item-control')({field: field, numItems: this.props.numItems, onRemove: this.props.onRemove})
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],26:[function(require,module,exports){
(function (global){
// # component.object

/*
Render an object.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

var CSSTransitionGroup = React.createFactory(React.addons.CSSTransitionGroup);

var tempKeyPrefix = '$$__temp__';

var tempKey = function (id) {
  return tempKeyPrefix + id;
};

var isTempKey = function (key) {
  return key.substring(0, tempKeyPrefix.length) === tempKeyPrefix;
};

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    nextLookupId: 0,

    getInitialState: function () {

      var keyToId = {};
      var fields = this.props.field.fields();
      var keyToField = {};
      var keyOrder = [];

      // Keys don't make good react keys, since we're allowing them to be
      // changed here, so we'll have to create fake keys and
      // keep track of the mapping of real keys to fake keys. Yuck.
      fields.forEach(function (field) {
        this.nextLookupId++;
        keyToId[field.def.key] = this.nextLookupId;
        keyToField[field.def.key] = field;
        keyOrder.push(field.def.key);
      }.bind(this));

      return {
        keyToId: keyToId,
        keyToField: keyToField,
        keyOrder: keyOrder,
        tempKeys: {}
      };
    },

    componentWillReceiveProps: function (newProps) {

      var keyToId = this.state.keyToId;
      var newKeyToId = {};
      var newKeyToField = {};
      var tempKeys = this.state.tempKeys;
      var newTempKeys = {};
      var keyOrder = this.state.keyOrder;
      var fields = newProps.field.fields();
      var addedKeys = [];

      // Look at the new fields.
      fields.forEach(function (field) {
        // Add new lookup if this key wasn't here last time.
        if (!keyToId[field.def.key]) {
          this.nextLookupId++;
          newKeyToId[field.def.key] = this.nextLookupId;
          addedKeys.push(field.def.key);
        } else {
          newKeyToId[field.def.key] = keyToId[field.def.key];
        }
        newKeyToField[field.def.key] = field;
        if (isTempKey(field.def.key) && newKeyToId[field.def.key] in tempKeys) {
          newTempKeys[newKeyToId[field.def.key]] = tempKeys[newKeyToId[field.def.key]];
        }
      }.bind(this));

      var newKeyOrder = [];

      // Look at the old fields.
      keyOrder.forEach(function (key) {
        if (newKeyToField[key]) {
          newKeyOrder.push(key);
        }
      });

      // Put added fields at the end. (So things don't get shuffled.)
      newKeyOrder = newKeyOrder.concat(addedKeys);

      this.setState({
        keyToId: newKeyToId,
        keyToField: newKeyToField,
        keyOrder: newKeyOrder,
        tempKeys: newTempKeys
      });
    },

    onAppend: function (itemIndex) {
      this.nextLookupId++;

      var keyToId = this.state.keyToId;
      var keyOrder = this.state.keyOrder;
      var tempKeys = this.state.tempKeys;

      var id = this.nextLookupId;
      var newKey = tempKey(id);

      keyToId[newKey] = id;
      tempKeys[id] = '';
      keyOrder.push(newKey);

      this.setState({
        keyToId: keyToId,
        tempKeys: tempKeys,
        keyOrder: keyOrder
      });

      this.props.field.append(itemIndex, newKey);
    },

    onRemove: function (key) {
      this.props.field.remove(key);
    },

    onMove: function (fromKey, toKey) {
      if (fromKey !== toKey) {
        var keyToId = this.state.keyToId;
        var keyOrder = this.state.keyOrder;
        var tempKeys = this.state.tempKeys;

        if (keyToId[toKey]) {
          var tempToKey = tempKey(keyToId[toKey]);
          tempKeys[keyToId[toKey]] = toKey;
          keyToId[tempToKey] = keyToId[toKey];
          keyOrder[keyOrder.indexOf(toKey)] = tempToKey;
          delete keyToId[toKey];
          this.setState({
            keyToId: keyToId,
            tempKeys: tempKeys,
            keyOrder: keyOrder
          });
          this.props.field.move(toKey, tempToKey);
        }

        if (!toKey) {
          toKey = tempKey(keyToId[fromKey]);
          tempKeys[keyToId[fromKey]] = '';
        }
        keyToId[toKey] = keyToId[fromKey];
        keyOrder[keyOrder.indexOf(fromKey)] = toKey;

        this.setState({
          keyToId: keyToId,
          keyOrder: keyOrder
        });

        this.props.field.move(fromKey, toKey);
      }
    },

    render: function () {

      var field = this.props.field;
      var fields = this.state.keyOrder.map(function (key) {
        return this.state.keyToField[key];
      }.bind(this));

      return plugin.component('field')({
        field: field, plain: this.props.plain
      },
        R.div({className: this.props.className},
          CSSTransitionGroup({transitionName: 'reveal'},
            fields.map(function (child) {
              return plugin.component('object-item')({
                key: this.state.keyToId[child.def.key],
                form: this.props.form,
                field: child,
                parent: field,
                onMove: this.onMove,
                onRemove: this.onRemove,
                tempKey: this.state.tempKeys[this.state.keyToId[child.def.key]]
              });
            }.bind(this))
          ),
          plugin.component('object-control')({field: field, onAppend: this.onAppend})
        )
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],27:[function(require,module,exports){
(function (global){
// # component.pretty-textarea

/*
Textarea that will display highlights behind "tags". Tags currently mean text
that is enclosed in braces like `{{foo}}`. Tags are replaced with labels if
available or humanized.

This component is quite complicated because:
- We are displaying text in the textarea but have to keep track of the real
  text value in the background. We can't use a data attribute, because it's a
  textarea, so we can't use any elements at all!
- Because of the hidden data, we also have to do some interception of
  copy, which is a little weird. We intercept copy and copy the real text
  to the end of the textarea. Then we erase that text, which leaves the copied
  data in the buffer.
- React loses the caret position when you update the value to something
  different than before. So we have to retain tracking information for when
  that happens.
- Because we monkey with copy, we also have to do our own undo/redo. Otherwise
  the default undo will have weird states in it.

So good luck!
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;
var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var noBreak = function (value) {
  return value.replace(/ /g, '\u00a0');
};

var LEFT_PAD = '\u00a0\u00a0';
// Why this works, I'm not sure.
var RIGHT_PAD = '  '; //'\u00a0\u00a0';

var idPrefixRegEx = /^[0-9]+__/;

// Zapier specific stuff. Make a plugin for this later.
var removeIdPrefix = function (key) {
  if (idPrefixRegEx.test(key)) {
    return key.replace(idPrefixRegEx, '');
  }
  return key;
};

var positionInNode = function (position, node) {
  var rect = node.getBoundingClientRect();
  if (position.x >= rect.left && position.x <= rect.right) {
    if (position.y >= rect.top && position.y <= rect.bottom) {
      return true;
    }
  }
};

module.exports = function (plugin) {

  var util = plugin.require('util');

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field'), plugin.require('mixin.undo-stack'), plugin.require('mixin.resize')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    getInitialState: function () {
      return {
        undoDepth: 100,
        isChoicesOpen: false,
        hoverPillRef: null
      };
    },

    componentWillMount: function () {
      // Not quite state, this is for tracking selection info.
      this.tracking = {};

      var parts = util.parseTextWithTags(this.props.field.value);
      var tokens = this.tokens(parts);
      var indexMap = this.indexMap(tokens);

      this.tracking.pos = indexMap.length;
      this.tracking.range = 0;
      this.tracking.tokens = tokens;
      this.tracking.indexMap = indexMap;
    },

    getStateSnapshot: function () {
      return {
        value: this.props.field.value,
        pos: this.tracking.pos,
        range: this.tracking.range
      };
    },

    setStateSnapshot: function (snapshot) {
      this.tracking.pos = snapshot.pos;
      this.tracking.range = snapshot.range;
      this.props.field.val(snapshot.value);
    },

    // Turn into individual characters and tags
    tokens: function (parts) {
      return [].concat.apply([], parts.map(function (part) {
        if (part.type === 'tag') {
          return part;
        } else {
          return part.value.split('');
        }
      }));
    },

    // Map each textarea index back to a token
    indexMap: function (tokens) {
      var indexMap = [];
      _.each(tokens, function (token, tokenIndex) {
        if (token.type === 'tag') {
          var label = LEFT_PAD + noBreak(this.prettyLabel(token.value)) + RIGHT_PAD;
          var labelChars = label.split('');
          _.each(labelChars, function () {
            indexMap.push(tokenIndex);
          });
        } else {
          indexMap.push(tokenIndex);
        }
      }.bind(this));
      return indexMap;
    },

    // Make highlight scroll match textarea scroll
    onScroll: function () {
      this.refs.highlight.getDOMNode().scrollTop = this.refs.content.getDOMNode().scrollTop;
      this.refs.highlight.getDOMNode().scrollLeft = this.refs.content.getDOMNode().scrollLeft;
    },

    // Given some postion, return the token index (position could be in the middle of a token)
    tokenIndex: function (pos, tokens, indexMap) {
      if (pos < 0) {
        pos = 0;
      } else if (pos >= indexMap.length) {
        return tokens.length;
      }
      return indexMap[pos];
    },

    onChange: function (event) {
      //console.log('change:', event.target.value);

      var node = event.target;

      // Tracking is holding previous position and range
      var prevPos = this.tracking.pos;
      var prevRange = this.tracking.range;

      // New position
      var pos = node.selectionStart;

      // Going to mutate the tokens.
      var tokens = this.tracking.tokens;

      // Using the previous position and range, get the previous token position
      // and range
      var prevTokenIndex = this.tokenIndex(prevPos, tokens, this.tracking.indexMap);
      var prevTokenEndIndex = this.tokenIndex(prevPos + prevRange, tokens, this.tracking.indexMap);
      var prevTokenRange = prevTokenEndIndex - prevTokenIndex;

      // Wipe out any tokens in the selected range because the change would have
      // erased that selection.
      if (prevTokenRange > 0) {
        tokens.splice(prevTokenIndex, prevTokenRange);
        this.tracking.indexMap = this.indexMap(tokens);
      }

      // If cursor has moved forward, then text was added.
      if (pos > prevPos) {
        var addedText = node.value.substring(prevPos, pos);
        // Insert the text into the tokens.
        tokens.splice(prevTokenIndex, 0, addedText);
      // If cursor has moved backward, then we deleted (backspaced) text
      } if (pos < prevPos) {
        var token = this.tokenAt(pos);
        var tokenBefore = this.tokenBefore(pos);
        // If we moved back onto a token, then we should move back to beginning
        // of token.
        if (token === tokenBefore) {
          pos = this.moveOffTag(pos, tokens, this.indexMap(tokens), -1);
        }
        var tokenIndex = this.tokenIndex(pos, tokens, this.tracking.indexMap);
        // Now we can remove the tokens that were deleted.
        tokens.splice(tokenIndex, prevTokenIndex - tokenIndex);
      }

      // Convert tokens back into raw value with tags. Newly formed tags will
      // become part of the raw value.
      var rawValue = this.rawValue(tokens);

      this.tracking.pos = pos;
      this.tracking.range = 0;

      // Set the value to the new raw value.
      this.props.field.val(rawValue);

      this.snapshot();
    },

    componentDidUpdate: function () {
      var value = this.props.field.value || '';
      var parts = util.parseTextWithTags(value);
      this.tracking.tokens = this.tokens(parts);
      this.tracking.indexMap = this.indexMap(this.tracking.tokens);

      var pos = this.normalizePosition(this.tracking.pos);
      var range = this.tracking.range;
      var endPos = this.normalizePosition(pos + range);
      range = endPos - pos;

      this.tracking.pos = pos;
      this.tracking.range = range;

      if (document.activeElement === this.refs.content.getDOMNode()) {
        // React can lose the selection, so put it back.
        this.refs.content.getDOMNode().setSelectionRange(pos, pos + range);
      }
    },

    // Get the label for a key.
    prettyLabel: function (key) {
      if (this.props.field.def.replaceChoicesLabels[key]) {
        return this.props.field.def.replaceChoicesLabels[key];
      }
      var cleaned = removeIdPrefix(key);
      return util.humanize(cleaned);
    },

    // Given the actual value of the field (with tags), get the plain text that
    // should show in the textarea.
    plainValue: function (value) {
      var parts = util.parseTextWithTags(value);
      return parts.map(function (part) {
        if (part.type === 'text') {
          return part.value;
        } else {
          return LEFT_PAD + noBreak(this.prettyLabel(part.value)) + RIGHT_PAD;
        }
      }.bind(this)).join('');
    },

    // Given the actual value of the field (with tags), get the html used to
    // highlight the labels.
    prettyValue: function (value) {
      var parts = util.parseTextWithTags(value);
      return parts.map(function (part, i) {
        if (part.type === 'text') {
          if (i === (parts.length - 1)) {
            if (part.value[part.value.length - 1] === '\n') {
              return part.value + '\u00a0';
            }
          }
          return part.value;
        } else {
          // Make a pill
          var pillRef = 'prettyPart' + i;
          var className = 'pretty-part';
          if (this.state.hoverPillRef && pillRef === this.state.hoverPillRef) {
            className += ' pretty-part-hover';
          }
          return R.span({key: i, className: className, ref: pillRef, 'data-pretty': true, 'data-ref': pillRef},
            R.span({className: 'pretty-part-left'}, LEFT_PAD),
            R.span({className: 'pretty-part-text'}, noBreak(this.prettyLabel(part.value))),
            R.span({className: 'pretty-part-right'}, RIGHT_PAD)
          );
        }
      }.bind(this));
    },

    // Given the tokens for a field, get the actual value of the field (with
    // tags)
    rawValue: function (tokens) {
      return tokens.map(function (token) {
        if (token.type === 'tag') {
          return '{{' + token.value + '}}';
        } else {
          return token;
        }
      }).join('');
    },

    // Given a position, if it's on a label, get the position left or right of
    // the label, based on direction and/or which side is closer
    moveOffTag: function (pos, tokens, indexMap, dir) {
      if (typeof dir === 'undefined' || dir > 0) {
        dir = 1;
      } else {
        dir = -1;
      }
      var token;
      if (dir > 0) {
        token = tokens[indexMap[pos]];
        while (pos < indexMap.length && tokens[indexMap[pos]].type === 'tag' && tokens[indexMap[pos]] === token) {
          pos++;
        }
      } else {
        token = tokens[indexMap[pos - 1]];
        while (pos > 0 && tokens[indexMap[pos - 1]].type === 'tag' && tokens[indexMap[pos - 1]] === token) {
          pos--;
        }
      }

      return pos;
    },

    // Get the token at some position.
    tokenAt: function (pos) {
      if (pos >= this.tracking.indexMap.length) {
        return null;
      }
      if (pos < 0) {
        pos = 0;
      }
      return this.tracking.tokens[this.tracking.indexMap[pos]];
    },

    // Get the token immediately before some position.
    tokenBefore: function (pos) {
      if (pos >= this.tracking.indexMap.length) {
        pos = this.tracking.indexMap.length;
      }
      if (pos <= 0) {
        return null;
      }
      return this.tracking.tokens[this.tracking.indexMap[pos - 1]];
    },

    // Given a position, get a corrected position (if necessary to be
    // corrected).
    normalizePosition: function (pos, prevPos) {
      if (_.isUndefined(prevPos)) {
        prevPos = pos;
      }
      // At start or end, so okay.
      if (pos <= 0 || pos >= this.tracking.indexMap.length) {
        if (pos < 0) {
          pos = 0;
        }
        if (pos > this.tracking.indexMap.length) {
          pos = this.tracking.indexMap.length;
        }
        return pos;
      }

      var token = this.tokenAt(pos);
      var tokenBefore = this.tokenBefore(pos);

      // Between two tokens, so okay.
      if (token !== tokenBefore) {
        return pos;
      }

      var prevToken = this.tokenAt(prevPos);
      var prevTokenBefore = this.tokenBefore(prevPos);

      var rightPos = this.moveOffTag(pos, this.tracking.tokens, this.tracking.indexMap);
      var leftPos = this.moveOffTag(pos, this.tracking.tokens, this.tracking.indexMap, -1);

      if (prevToken !== prevTokenBefore) {
        // Moved from left edge.
        if (prevToken === token) {
          return rightPos;
        }
        // Moved from right edge.
        if (prevTokenBefore === token) {
          return leftPos;
        }
      }

      var newPos = rightPos;

      if (pos === prevPos || pos < prevPos) {
        if (rightPos - pos > pos - leftPos) {
          newPos = leftPos;
        }
      }
      return newPos;
    },



    onSelect: function (event) {
      var node = event.target;

      var pos = node.selectionStart;
      var endPos = node.selectionEnd;

      if (pos === endPos && this.state.hoverPillRef) {
        var tokenAt = this.tokenAt(pos);
        var tokenBefore = this.tokenBefore(pos);

        if (tokenAt && tokenAt === tokenBefore && tokenAt.type && tokenAt.type === 'tag') {
          // Clicked a tag.
          var rightPos = this.moveOffTag(pos, this.tracking.tokens, this.tracking.indexMap);
          var leftPos = this.moveOffTag(pos, this.tracking.tokens, this.tracking.indexMap, -1);
          this.tracking.pos = leftPos;
          this.tracking.range = rightPos - leftPos;
          node.selectionStart = leftPos;
          node.selectionEnd = rightPos;

          this.setState({isChoicesOpen: true});

          return;
        }
      }

      pos = this.normalizePosition(pos, this.tracking.pos);
      endPos = this.normalizePosition(endPos, this.tracking.pos + this.tracking.range);

      this.tracking.pos = pos;
      this.tracking.range = endPos - pos;

      node.selectionStart = pos;
      node.selectionEnd = endPos;
    },

    onCopy: function () {
      var node = this.refs.content.getDOMNode();
      var start = node.selectionStart;
      var end = node.selectionEnd;
      var text = node.value.substring(start, end);
      var realStartIndex = this.tokenIndex(start, this.tracking.tokens, this.tracking.indexMap);
      var realEndIndex = this.tokenIndex(end, this.tracking.tokens, this.tracking.indexMap);
      var tokens = this.tracking.tokens.slice(realStartIndex, realEndIndex);
      text = this.rawValue(tokens);
      var originalValue = node.value;
      node.value = node.value + text;
      node.setSelectionRange(originalValue.length, originalValue.length + text.length);
      window.setTimeout(function() {
        node.value = originalValue;
        node.setSelectionRange(start, end);
      },0);
    },

    onCut: function () {
      var node = this.refs.content.getDOMNode();
      var start = node.selectionStart;
      var end = node.selectionEnd;
      var text = node.value.substring(start, end);
      var realStartIndex = this.tokenIndex(start, this.tracking.tokens, this.tracking.indexMap);
      var realEndIndex = this.tokenIndex(end, this.tracking.tokens, this.tracking.indexMap);
      var tokens = this.tracking.tokens.slice(realStartIndex, realEndIndex);
      text = this.rawValue(tokens);
      var originalValue = node.value;
      var cutValue = node.value.substring(0, start) + node.value.substring(end);
      node.value = node.value + text;
      node.setSelectionRange(originalValue.length, originalValue.length + text.length);
      var cutTokens = this.tracking.tokens.slice(0, realStartIndex).concat(this.tracking.tokens.slice(realEndIndex));
      window.setTimeout(function() {
        node.value = cutValue;
        node.setSelectionRange(start, start);
        this.tracking.pos = start;
        this.tracking.range = 0;
        this.tracking.tokens = cutTokens;
        this.tracking.indexMap = this.indexMap(this.tracking.tokens);

        // Convert tokens back into raw value with tags. Newly formed tags will
        // become part of the raw value.
        var rawValue = this.rawValue(this.tracking.tokens);

        // Set the value to the new raw value.
        this.props.field.val(rawValue);

        this.snapshot();
      }.bind(this),0);
    },

    onKeyDown: function (event) {

      if (event.keyCode === 37) {
        this.leftArrowDown = true;
      } else if (event.keyCode === 39) {
        this.rightArrowDown = true;
      }

      // Cmd-Z or Ctrl-Z
      if (event.keyCode === 90 && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        this.undo();
      // Cmd-Shift-Z or Ctrl-Y
      } else if (
        (event.keyCode === 89 && event.ctrlKey && !event.shiftKey) ||
        (event.keyCode === 90 && event.metaKey && event.shiftKey)
      ) {
        this.redo();
      }
    },

    onKeyUp: function (event) {
      if (event.keyCode === 37) {
        this.leftArrowDown = false;
      } else if (event.keyCode === 39) {
        this.rightArrowDown = false;
      }
    },

    // Keep the highlight styles in sync with the textarea styles.
    adjustStyles: function (isMount) {
      var overlay = this.refs.highlight.getDOMNode();
      var content = this.refs.content.getDOMNode();

      var style = window.getComputedStyle(content);

      var backgroundColor = style.backgroundColor;

      util.copyElementStyle(content, overlay);

      overlay.style.position = 'absolute';
      overlay.style.whiteSpace = 'pre-wrap';
      overlay.style.color = 'rgba(0,0,0,0)';
      overlay.style.webkitTextFillColor = 'rgba(0,0,0,0)';
      overlay.style.resize = 'none';
      overlay.style.borderColor = 'rgba(0,0,0,0)';

      if (util.browser.isMozilla) {

        var paddingTop = parseFloat(style.paddingTop);
        var paddingBottom = parseFloat(style.paddingBottom);

        var borderTop = parseFloat(style.borderTopWidth);
        var borderBottom = parseFloat(style.borderBottomWidth);

        overlay.style.paddingTop = '0px';
        overlay.style.paddingBottom = '0px';

        overlay.style.height = (content.clientHeight - paddingTop - paddingBottom + borderTop + borderBottom) + 'px';
        overlay.style.top = style.paddingTop;
        overlay.style.boxShadow = 'none';
      }

      if (isMount) {
        this.backgroundColor = backgroundColor;
      }
      overlay.style.backgroundColor = this.backgroundColor;
      content.style.backgroundColor = 'rgba(0,0,0,0)';
    },

    // If the textarea is resized, need to re-sync the styles.
    onResize: function () {
      this.adjustStyles();
    },

    // If the window is resized, may need to re-sync the styles.
    // Probably not necessary with element resize?
    onResizeWindow: function () {
      this.adjustStyles();
    },

    componentDidMount: function () {
      this.adjustStyles(true);
      this.setOnResize('content', this.onResize);
      //this.setOnClickOutside('choices', this.onClickOutsideChoices);
    },

    onInsertFromSelect: function (event) {
      if (event.target.selectedIndex > 0) {
        var tag = event.target.value;
        event.target.selectedIndex = 0;
        var pos = this.tracking.pos;
        var insertPos = this.normalizePosition(pos);
        var tokens = this.tracking.tokens;
        var tokenIndex = this.tokenIndex(insertPos, tokens, this.tracking.indexMap);
        tokens.splice(tokenIndex, 0, {
          type: 'tag',
          value: tag
        });
        this.tracking.indexMap = this.indexMap(tokens);
        var newValue = this.rawValue(tokens);
        this.tracking.pos += this.prettyLabel(tag).length;
        this.props.field.val(newValue);
      }
    },

    onInsert: function (value) {
      var tag = value;
      var pos = this.tracking.pos;
      var endPos = this.tracking.pos + this.tracking.range;
      var insertPos = this.normalizePosition(pos);
      var endInsertPos = this.normalizePosition(endPos);
      var tokens = this.tracking.tokens;
      var tokenIndex = this.tokenIndex(insertPos, tokens, this.tracking.indexMap);
      var tokenEndIndex = this.tokenIndex(endInsertPos, tokens, this.tracking.indexMap);
      tokens.splice(tokenIndex, tokenEndIndex - tokenIndex, {
        type: 'tag',
        value: tag
      });
      this.tracking.indexMap = this.indexMap(tokens);
      var newValue = this.rawValue(tokens);
      this.tracking.pos += this.prettyLabel(tag).length;
      this.props.field.val(newValue);
      this.setState({
        isChoicesOpen: false
      });
    },

    onToggleChoices: function () {
      this.setState({
        isChoicesOpen: !this.state.isChoicesOpen
      });
    },

    onCloseChoices: function () {
      this.setState({
        isChoicesOpen: false
      });
    },

    getCloseIgnoreNodes: function () {
      return this.refs.toggle.getDOMNode();
    },

    onClickOutsideChoices: function () {
      // // If we didn't click on the toggle button, close the choices.
      // if (this.isNodeOutside(this.refs.toggle.getDOMNode(), event.target)) {
      //   console.log('not a toggle click')
      //   this.setState({
      //     isChoicesOpen: false
      //   });
      // }
    },

    onMouseMove: function (event) {
      // Placeholder to get at pill under mouse position. Inefficient, but not
      // sure there's another way.

      var position = {x: event.clientX, y: event.clientY};
      var nodes = this.refs.highlight.getDOMNode().childNodes;
      var matchedNode = null;
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (nodes[i].getAttribute('data-pretty')) {
          if (positionInNode(position, node)) {
            matchedNode = node;
            break;
          }
        }
      }

      if (matchedNode) {
        if (this.state.hoverPillRef !== matchedNode.getAttribute('data-ref')) {
          this.setState({
            hoverPillRef: matchedNode.getAttribute('data-ref')
          });
        }
      } else if (this.state.hoverPillRef) {
        this.setState({
          hoverPillRef: null
        });
      }
    },

    render: function () {
      var field = this.props.field;

      var replaceChoices = field.def.replaceChoices;

      // var selectReplaceChoices = [{
      //   value: '',
      //   label: 'Insert...'
      // }].concat(replaceChoices);

      return plugin.component('field')({
        field: field, plain: this.props.plain
      }, R.div({style: {position: 'relative'}},

        R.pre({
          className: 'pretty-highlight',
          ref: 'highlight'
        },
          this.prettyValue(field.value)
        ),

        R.textarea(_.extend({
          className: util.className(this.props.className, 'pretty-content'),
          ref: 'content',
          rows: field.def.rows || this.props.rows,
          name: field.key,
          value: this.plainValue(field.value),
          onChange: this.onChange,
          onScroll: this.onScroll,
          style: {
            position: 'relative',
            top: 0,
            left: 0,
            cursor: this.state.hoverPillRef ? 'pointer' : null
          },
          onKeyPress: this.onKeyPress,
          onKeyDown: this.onKeyDown,
          onKeyUp: this.onKeyUp,
          onSelect: this.onSelect,
          onCopy: this.onCopy,
          onCut: this.onCut,
          onMouseMove: this.onMouseMove,
          onFocus: this.onFocus,
          onBlur: this.onBlur
        }, plugin.config.attributes)),

        R.a({ref: 'toggle', href: 'JavaScript' + ':', onClick: this.onToggleChoices}, 'Insert...'),

        plugin.component('choices')({
          ref: 'choices',
          choices: replaceChoices, open: this.state.isChoicesOpen,
          onSelect: this.onInsert, onClose: this.onCloseChoices, ignoreCloseNodes: this.getCloseIgnoreNodes})
        //,

        // R.select({onChange: this.onInsertFromSelect},
        //   selectReplaceChoices.map(function (choice, i) {
        //     return R.option({
        //       key: i,
        //       value: choice.value
        //     }, choice.label);
        //   })
        // )
      ));
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],28:[function(require,module,exports){
(function (global){
// # component.remove-item

/*
Remove an item.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className,
        label: plugin.configValue('label', '[remove]')
      };
    },

    render: function () {
      return R.span({className: this.props.className, onClick: this.props.onClick}, this.props.label);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],29:[function(require,module,exports){
(function (global){
// # component.root

/*
Root component just used to spit out all the fields for a form.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  var util = plugin.require('util');

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: util.className('root', plugin.config.className)
      };
    },

    render: function () {
      var field = this.props.field;

      return R.div({
        className: this.props.className
      },
        field.fields().map(function (field, i) {
          return field.component({key: field.def.key || i, onFocus: this.props.onFocus, onBlur: this.props.onBlur});
        }.bind(this))
      );
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],30:[function(require,module,exports){
(function (global){
// # component.help

/*
Just the help text block.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    render: function () {

      var choice = this.props.choice;

      return choice.sample ?
        R.div({className: this.props.className},
          choice.sample
        ) :
        R.span(null);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],31:[function(require,module,exports){
(function (global){
// # component.select

/*
Render select element to give a user choices for the value of a field. Note
it should support values other than strings. Currently this is only tested for
boolean values, but it _should_ work for other values.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;
var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onChange: function (event) {
      var choiceValue = event.target.value;
      var choiceType = choiceValue.substring(0, choiceValue.indexOf(':'));
      if (choiceType === 'choice') {
        var choiceIndex = choiceValue.substring(choiceValue.indexOf(':') + 1);
        choiceIndex = parseInt(choiceIndex);
        this.props.field.val(this.props.field.def.choices[choiceIndex].value);
      }
    },

    render: function () {

      var field = this.props.field;
      var choices = field.def.choices || [];

      var choicesOrLoading;

      if (choices.length === 1 && choices[0].value === '///loading///') {
        choicesOrLoading = R.div({},
          'Loading choices...'
        );
      } else {

        var value = field.value !== undefined ? field.value : '';

        choices = choices.map(function (choice, i) {
          return {
            choiceValue: 'choice:' + i,
            value: choice.value,
            label: choice.label
          };
        });

        var valueChoice = _.find(choices, function (choice) {
          return choice.value === value;
        });

        if (valueChoice === undefined) {

          var label = value;
          if (!_.isString(value)) {
            label = JSON.stringify(value);
          }
          valueChoice = {
            choiceValue: 'value:',
            value: value,
            label: label
          };
          choices = [valueChoice].concat(choices);
        }

        choicesOrLoading = R.select({
          className: this.props.className,
          onChange: this.onChange,
          value: valueChoice.choiceValue,
          onFocus: this.onFocus,
          onBlur: this.onBlur
        },
          choices.map(function (choice, i) {
            return R.option({
              key: i,
              value: choice.choiceValue
            }, choice.label);
          }.bind(this))
        );
      }

      return plugin.component('field')({
        field: field, plain: this.props.plain
      }, choicesOrLoading);
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],32:[function(require,module,exports){
(function (global){
// # component.text

/*
Just a simple text input.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onChange: function (event) {
      var newValue = event.target.value;
      this.props.field.val(newValue);
    },

    render: function () {

      var field = this.props.field;

      return plugin.component('field')({
        field: field, plain: this.props.plain
      }, R.input({
        className: this.props.className,
        type: 'text',
        value: field.value,
        rows: field.def.rows,
        onChange: this.onChange,
        onFocus: this.onFocus,
        onBlur: this.onBlur
      }));
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],33:[function(require,module,exports){
(function (global){
// # component.textarea

/*
Just a simple multi-row textarea.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports = React.createClass({

    displayName: plugin.name,

    mixins: [plugin.require('mixin.field')],

    getDefaultProps: function () {
      return {
        className: plugin.config.className,
        rows: plugin.config.rows || 5
      };
    },

    onChange: function (event) {
      var newValue = event.target.value;
      this.props.field.val(newValue);
    },

    render: function () {

      var field = this.props.field;

      return plugin.component('field')({
        field: field, plain: this.props.plain
      }, R.textarea({
        className: this.props.className,
        value: field.value,
        rows: field.def.rows || this.props.rows,
        onChange: this.onChange,
        onFocus: this.onFocus,
        onBlur: this.onBlur
      }));
    }
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],34:[function(require,module,exports){
(function (global){
// # core.field

/*
The core field plugin provides the Field prototype. Fields represent a
particular state in time of a field definition, and they provide helper methods
to notify the form store of changes.

Fields are lazily created and evaluated, but once evaluated, they should be
considered immutable.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  var router = plugin.require('field-router');
  var util = plugin.require('util');
  var evaluator = plugin.require('eval');
  var compiler = plugin.require('compiler');

  // The Field constructor.
  var Field = function (form, def, value, parent) {
    var field = this;

    field.form = form;
    field.def = def;
    field.value = value;
    field.parent = parent;
    field.groups = {};
    field.tempChildren = [];
  };

  // Attach a field factory to the form prototype.
  plugin.exports.field = function () {
    var form = this;

    return new Field(form, {
      type: 'root'
    }, form.store.value);
  };

  var proto = Field.prototype;

  // Return the type plugin for this field.
  proto.typePlugin = function () {
    var field = this;

    if (!field._typePlugin) {
      field._typePlugin = null;
      try {
        field._typePlugin = plugin.require('type.' + field.def.type);
      } catch (e) {
        console.log('Problem trying to load type plugin.');
        console.log('Field definition:');
        console.log(JSON.stringify(field.def, null, 2));
        console.log(field.valuePath());
        console.log(e.stack);
      }
      if (!field._typePlugin) {
        field._typePlugin = {};
      }
    }

    return field._typePlugin;
  };

  // Get a component for this field.
  proto.component = function (props) {
    var field = this;
    props = _.extend({}, props, {field: field});
    var component = router.componentForField(field);
    return component(props);
  };

  // Get the child fields for this field.
  proto.fields = function () {
    var field = this;

    if (!field._fields) {
      var fields;
      if (field.typePlugin().fields) {
        fields = field.typePlugin().fields(field);
      } else if (field.def.fields) {
        fields = field.def.fields.map(function (def) {
          return field.createChild(def);
        });
      } else {
        fields = [];
      }
      field._fields = fields;
    }

    return field._fields;
  };

  // Get the items (child field definitions) for this field.
  proto.items = function () {
    var field = this;

    if (!field._items) {
      if (_.isArray(field.def.items)) {
        field._items = field.def.items.map(function (item) {
          return field.resolve(item);
        });
      } else {
        field._items = [];
      }
    }

    return field._items;
  };

  // Resolve a field reference if necessary.
  proto.resolve = function (def) {
    var field = this;

    if (_.isString(def)) {
      def = field.form.findDef(def);
      if (!def) {
        throw new Error('Could not find field: ' + def);
      }
    }

    return def;
  };

  // Evaluate a field definition and return a new field definition.
  proto.evalDef = function (def) {
    var field = this;

    if (def.eval) {

      try {
        var extDef = field.eval(def.eval);
        if (extDef) {
          def = _.extend({}, def, extDef);
          if (def.fields) {
            def.fields = def.fields.map(function (childDef) {
              childDef = compiler.expandDef(childDef, field.form.store.templateMap);
              return compiler.compileDef(childDef);
            });
          }
          def = compiler.compileDef(def);
        }
      } catch (e) {
        console.log('Problem in eval: ', JSON.stringify(def.eval));
        console.log(e.message);
        console.log(e.stack);
      }
    }

    return def;
  };

  // Evaluate an expression in the context of a field.
  proto.eval = function (expression, context) {
    return evaluator.evaluate(expression, this, context);
  };

  // Create a child field from a definition.
  proto.createChild = function (def) {
    var field = this;

    def = field.resolve(def);

    var value = field.value;

    def = field.evalDef(def);

    if (!util.isBlank(def.key)) {
      if (value && !_.isUndefined(value[def.key])) {
        value = value[def.key];
      } else {
        value = undefined;
      }
    } else {
      value = def.value;
    }

    if (!def.type) {
      var typeDef = util.fieldDefFromValue(value);
      def = _.extend({}, def);
      def.type = typeDef.type;
      def = compiler.compileDef(def);
    }

    var childField = new Field(field.form, def, value, field);

    field.tempChildren.push(childField);

    return childField;

    // if (def.eval) {
    //   def = childField.evalDef(def);
    //   if (util.isBlank(def.key)) {
    //     value = def.value;
    //   }
    //   childField = new Field(field.form, def, value, field);
    // }
    //
    // return childField;
  };

  // Given a value, find an appropriate field definition for this field.
  proto.itemForValue = function (value) {
    var field = this;

    var item = _.find(field.items(), function (item) {
      return util.itemMatchesValue(item, value);
    });
    if (item) {
      item = _.extend({}, item);
    } else {
      item = util.fieldDefFromValue(value);
    }

    return item;
  };

  // Get all the fields belonging to a group.
  proto.groupFields = function (groupName, ignoreTempChildren) {
    var field = this;

    if (!field.groups[groupName]) {
      field.groups[groupName] = [];

      if (field.parent) {
        var siblings = field.parent.fields();
        siblings.forEach(function (sibling) {
          if (sibling !== field && sibling.def.group === groupName) {
            field.groups[groupName].push(sibling);
          }
        });
        var parentGroupFields = field.parent.groupFields(groupName, true);
        field.groups[groupName] = field.groups[groupName].concat(parentGroupFields);
      }
    }

    if (!ignoreTempChildren && field.groups[groupName].length === 0) {
      // looking at children so far
      var childGroupFields = [];
      field.tempChildren.forEach(function (child) {
        if (child.def.group === groupName) {
          childGroupFields.push(child);
        }
      });
      return childGroupFields;
    }

    return field.groups[groupName];
  };

  // Walk backwards through parents and build out a path array to the value.
  proto.valuePath = function (childPath) {
    var field = this;

    var path = childPath || [];
    if (!util.isBlank(field.def.key)) {
      path = [field.def.key].concat(path);
    }
    if (field.parent) {
      return field.parent.valuePath(path);
    }
    return path;
  };

  // Set the value for this field.
  proto.val = function (value) {
    var field = this;

    field.form.actions.setValue(field, value);
  };

  // Remove a child value from this field.
  proto.remove = function (key) {
    var field = this;

    field.form.actions.removeValue(field, key);
  };

  // Move a child value from one key to another.
  proto.move = function (fromKey, toKey) {
    var field = this;

    field.form.actions.moveValue(field, fromKey, toKey);
  };

  // Get the default value for this field.
  proto.default = function () {
    var field = this;

    if (!_.isUndefined(field.def.value)) {
      return util.copyValue(field.def.value);
    }

    if (!_.isUndefined(field.def.default)) {
      return util.copyValue(field.def.default);
    }

    if (!_.isUndefined(field.typePlugin().default)) {
      return util.copyValue(field.typePlugin().default);
    }

    return null;
  };

  // Append a new value. Use the `itemIndex` to get an appropriate
  // item, inflate it, and create a default value.
  proto.append = function (itemIndex, key) {
    var field = this;

    var item = field.items()[itemIndex];
    if (item) {
      item = _.extend(item);
    } else {
      // Fallback to a string field. Or should we fallback to json???
      item = {
        type: 'string'
      };
    }

    var value = field.value;

    if (!value) {
      value = key ? {} : [];
      field.val(value);
    }

    item.key = key ? key : value.length;

    var child = field.createChild(item);

    var obj = child.default();

    if (_.isArray(obj) || _.isObject(obj)) {
      var chop = field.valuePath().length + 1;

      child.inflate(function (path, value) {
        obj = util.setIn(obj, path.slice(chop), value);
      });
    }

    if (key) {
      field.form.actions.setValue(child, obj);
    } else {
      field.form.actions.appendValue(field, obj);
    }
  };

  // Determine whether the field is hidden.
  proto.hidden = function () {
    var field = this;

    return field.def.hidden || field.typePlugin().hidden;
  };

  // Expand all child fields and call the setter function with the default
  // values at each path.
  proto.inflate = function (onSetValue) {
    var field = this;

    if (!util.isBlank(field.def.key) && _.isUndefined(field.value)) {
      onSetValue(field.valuePath(), field.default());
    }

    var fields = field.fields();

    fields.forEach(function (child) {
      child.inflate(onSetValue);
    });
  };

  // Called from unmount. When fields are removed for whatever reason, we
  // should delete the corresponding value.
  proto.erase = function () {
    var field = this;
    if (!util.isBlank(field.def.key) && !_.isUndefined(field.value)) {
      field.form.actions.eraseValue(field, {});
    }
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],35:[function(require,module,exports){
// # core.form-init

/*
This plugin makes it easy to hook into form initialization, without having to
configure all the other core plugins.
*/

'use strict';

module.exports = function (plugin) {

  var initPlugins = plugin.requireAll(plugin.config.init);

  var proto = plugin.exports;

  proto.init = function () {
    var form = this;

    initPlugins.forEach(function (plugin) {
      plugin.apply(form, arguments);
    });
  };
};

},{}],36:[function(require,module,exports){
(function (global){
// # core.form

/*
The core form plugin supplies methods that get added to the Form prototype.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);
var EventEmitter = require('eventemitter3');

module.exports = function (plugin) {

  var proto = plugin.exports;

  // Get the store plugin.
  var createStore = plugin.require(plugin.config.store);

  var util = plugin.require('util');
  var loader = plugin.require('loader');

  // Helper to create actions, which will tell the store that something has
  // happened. Note that actions go straight to the store. No events,
  // dispatcher, etc.
  var createSyncActions = function (store, names) {
    var actions = {};
    names.forEach(function (name) {
      actions[name] = function () {
        store[name].apply(store, arguments);
      };
    });
    return actions;
  };

  // Initialize the form instance.
  proto.init = function (options) {
    var form = this;

    options = options || {};

    // Need an emitter to emit change events from the store.
    var storeEmitter = new EventEmitter();

    // Create a store.
    form.store = createStore(form, storeEmitter, options);

    // Create the actions to notify the store of changes.
    form.actions = createSyncActions(form.store, ['setFormValue', 'setValue', 'setFields', 'removeValue', 'appendValue', 'moveValue', 'eraseValue', 'setMeta']);

    // Seed the value from any fields.
    form.store.inflate();

    // Add on/off to get change events from form.
    form.on = storeEmitter.on.bind(storeEmitter);
    form.off = storeEmitter.off.bind(storeEmitter);
    form.once = storeEmitter.once.bind(storeEmitter);
  };

  // Get or set the value of a form.
  proto.val = function (value) {
    var form = this;

    if (!_.isUndefined(value)) {
      return form.actions.setFormValue(value);
    }

    return util.copyValue(form.store.value);
  };

  // Set/change the fields for a form.
  proto.fields = function (fields) {
    var form = this;

    form.actions.setFields(fields);
  };

  // Find a field template given a key.
  proto.findDef = function (key) {
    var form = this;

    return form.store.templateMap[key] || null;
  };

  // Get or set metadata.
  proto.meta = function (key, value, status) {
    var form = this;

    if (!_.isUndefined(value)) {
      return form.actions.setMeta(key, value, status);
    }

    return form.store.getMeta(key);
  };

  proto.metaStatus = function (key) {
    var form = this;

    return form.store.getMetaStatus(key);
  };

  // Load metadata.
  proto.loadMeta = function (source, params) {

    params = params || {};
    var keys = Object.keys(params);
    var validKeys = keys.filter(function (key) {
      return params[key];
    });
    if (validKeys.length < keys.length) {
      return;
    }
    loader.loadMeta(this, source, params);
  };

  proto.unloadOtherMeta = function (needs) {
    var form = this;

    var keys = needs.map(function (need) {
      return util.metaCacheKey.apply(util, need);
    });
    var dropKeys = _.without.apply(_, [form.store.metaKeys()].concat(keys));
    dropKeys.forEach(function (key) {
      form.meta(key, null, 'unloaded');
    });
  };

  // Add a metdata source function, via the loader plugin.
  proto.source = loader.source;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"eventemitter3":65}],37:[function(require,module,exports){
(function (global){
// # core.formatic

/*
The core formatic plugin adds methods to the formatic instance.
*/

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);

module.exports = function (plugin) {

  var f = plugin.exports;

  // Use the field-router plugin as the router.
  var router = plugin.require('field-router');

  // Route a field to a component.
  f.route = router.route;

  // Render a component to a node.
  f.render = function (component, node) {

    React.renderComponent(component, node);
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],38:[function(require,module,exports){
(function (global){
// # compiler

// The compiler plugin knows how to normalize field definitions into standard
// field definitions that can be understood be routers and components.

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  // Grab all the compiler plugins which can be stacked.
  var compilerPlugins = plugin.requireAll(plugin.config.compilers);

  var util = plugin.require('util');

  var compiler = plugin.exports;

  // For a set of fields, make a map of template names to field definitions. All
  // field definitions can be used as templates, whether marked as templates or
  // not.
  compiler.templateMap = function (fields) {
    var map = {};
    fields.forEach(function (field) {
      if (field.key) {
        map[field.key] = field;
      }
      if (field.id) {
        map[field.id] = field;
      }
    });
    return map;
  };

  // Fields and items can extend other field definitions. Fields can also have
  // child fields that point to other field definitions. Here, we expand all
  // those out so that components don't have to worry about this.
  compiler.expandDef = function (def, templateMap) {
    var isTemplate = def.template;
    var ext = def.extends;
    if (_.isString(ext)) {
      ext = [ext];
    }
    if (ext) {
      var bases = ext.map(function (base) {
        var template = templateMap[base];
        if (!template) {
          throw new Error('Template ' + base + ' not found.');
        }
        return template;
      });
      var chain = [{}].concat(bases.reverse().concat([def]));
      def = _.extend.apply(_, chain);
    }
    if (def.fields) {
      def.fields = def.fields.map(function (childDef) {
        if (!_.isString(childDef)) {
          return compiler.expandDef(childDef, templateMap);
        }
        return childDef;
      });
    }
    if (def.items) {
      def.items = def.items.map(function (itemDef) {
        if (!_.isString(itemDef)) {
          return compiler.expandDef(itemDef, templateMap);
        }
        return itemDef;
      });
    }
    if (!isTemplate && def.template) {
      delete def.template;
    }
    return def;
  };

  // For an array of field definitions, expand each field definition.
  compiler.expandFields = function (fields) {
    var templateMap = compiler.templateMap(fields);
    return fields.map(function (def) {
      return compiler.expandDef(def, templateMap);
    });
  };

  // Run a field definition through all available compilers.
  compiler.compileDef = function (def) {

    //console.log('in:', JSON.stringify(def))

    def = util.deepCopy(def);

    var result;
    compilerPlugins.forEach(function (plugin) {
      result = plugin.compile(def);
      if (result) {
        def = result;
      }
    });

    if (def.type) {
      var typePlugin = plugin.require('type.' + def.type);

      if (typePlugin.compile) {
        result = typePlugin.compile(def);
        if (result) {
          def = result;
        }
      }
    }

    if (def.fields) {
      // Compile any inline fields.
      def.fields = def.fields.map(function (childDef) {
        if (_.isObject(childDef)) {
          return compiler.compileDef(childDef);
        }
        return childDef;
      });
    }

    //console.log('out:', JSON.stringify(def))

    return def;
  };

  // For an array of field definitions, compile each field definition.
  compiler.compileFields = function (fields) {
    return fields.map(function (field) {
      return compiler.compileDef(field);
    });
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],39:[function(require,module,exports){
(function (global){
// # component

// At its most basic level, the component plugin simply maps component names to
// plugin names, returning the component factory for that component. For
// example, `plugin.component('text')` becomes
// `plugin.require('component.text')`. This is a useful placholder in case we
// later want to make formatic able to decide components at runtime. For now,
// however, this allows us to inject "prop modifiers" which are plugins that
// modify a components properties before it receives them.

'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);

module.exports = function (plugin) {

  // Registry for prop modifiers.
  var propModifiers = {};

  // Add a "prop modifer" which is just a function that modifies a components
  // properties before it receives them.
  var addPropModifier = function (name, modifyFn) {
    if (!propModifiers[name]) {
      propModifiers[name] = [];
    }
    propModifiers[name].push(modifyFn);
  };

  // Grab all the prop modifier plugins.
  var propsPlugins = plugin.requireAll(plugin.config.props);

  // Register all the prop modifier plugins.
  propsPlugins.forEach(function (plugin) {
    addPropModifier.apply(null, plugin);
  });

  // Registry for component factories. Since we'll be modifying the props going
  // to the factories, we'll store our own component factories here.
  var componentFactories = {};

  // Retrieve the appropriate component factory, which may be a wrapper that
  // runs the component properties through prop modifier functions.
  plugin.exports.component = function (name) {

    if (!componentFactories[name]) {
      var component = React.createFactory(plugin.require('component.' + name));
      componentFactories[name] = function (props, children) {
        if (propModifiers[name]) {
          propModifiers[name].forEach(function (modify) {
            var result = modify(props);
            if (result) {
              props = result;
            }
          });
        }
        return component(props, children);
      };
    }
    return componentFactories[name];
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],40:[function(require,module,exports){
(function (global){
// # core

// The core plugin exports a function that takes a formatic instance and
// extends the instance with additional methods.

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  plugin.exports = function (formatic) {

    // The core plugin really doesn't do much. It actually relies on other
    // plugins to do the dirty work. This way, you can easily add additional
    // plugins to do more dirty work.
    var formaticPlugins = plugin.requireAll(plugin.config.formatic);

    // We have special form plugins which are just used to modify the Form
    // prototype.
    var formPlugins = plugin.requireAll(plugin.config.form);

    // Pass the formatic instance off to each of the formatic plugins.
    formaticPlugins.forEach(function (f) {
      _.keys(f).forEach(function (key) {
        if (!_.isUndefined(formatic[key])) {
          throw new Error('Property already defined for formatic: ' + key);
        }
        formatic[key] = f[key];
      });
    });

    // ## Form prototype

    // The Form constructor creates a form given a set of options. Options
    // can have `fields` and `value`.
    var Form = function (options) {
      if (this.init) {
        this.init(options);
      }
    };

    // Add the form factory to the formatic instance.
    formatic.form = function (options) {
      return new Form(options);
    };

    Form.prototype = formatic.form;

    // Keep form init methods here.
    var inits = [];

    // Go through form plugins and add each plugin's methods to the form
    // prototype.
    formPlugins.forEach(function (proto) {
      _.keys(proto).forEach(function (key) {
        // Init plugins can be stacked.
        if (key === 'init') {
          inits.push(proto[key]);
        } else {
          if (!_.isUndefined(Form.prototype[key])) {
            throw new Error('Property already defined for form: ' + key);
          }
          Form.prototype[key] = proto[key];
        }
      });
    });

    // Create an init method for the form prototype based on the available init
    // methods.
    if (inits.length === 0) {
      Form.prototype.init = function () {};
    } else if (inits.length === 1) {
      Form.prototype.init = inits[0];
    } else {
      Form.prototype.init = function () {
        var form = this;
        var args = arguments;

        inits.forEach(function (init) {
          init.apply(form, args);
        });
      };
    }
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],41:[function(require,module,exports){
(function (global){
// # eval-functions

/*
Default eval functions. Each function is part of its own plugin, but all are
kept together here as part of a plugin bundle.

Note that eval functions decide when their arguments get evaluated. This way,
you can create control structures (like if) that conditionally evaluates its
arguments.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var wrapFn = function (fn) {
  return function (plugin) {
    plugin.exports = function (args, field, context) {
      args = field.eval(args, context);
      var result = fn.apply(null, args);
      return result;
    };
  };
};

var methodCall = function (method) {
  return function (plugin) {
    plugin.exports = function (args, field, context) {
      args = field.eval(args, context);
      if (args.length > 0) {
        return args[0][method].apply(args[0], args.slice(1));
      }
    };
  };
};

var plugins = {
  if: function (plugin) {
    plugin.exports = function (args, field, context) {
      return field.eval(args[0], context) ? field.eval(args[1], context) : field.eval(args[2], context);
    };
  },

  eq: function (plugin) {
    plugin.exports = function (args, field, context) {
      return field.eval(args[0], context) === field.eval(args[1], context);
    };
  },

  not: function (plugin) {
    plugin.exports = function (args, field, context) {
      return !field.eval(args[0], context);
    };
  },

  or: function (plugin) {
    plugin.exports = function (args, field, context) {
      var arg;
      for (var i = 0; i < args.length; i++) {
        arg = field.eval(args[i], context);
        if (arg) {
          return arg;
        }
      }
      return arg;
    };
  },

  and: function (plugin) {
    plugin.exports = function (args, field, context) {
      for (var i = 0; i < args.length; i++) {
        var arg = field.eval(args[i], context);
        if (!arg || i === (args.length - 1)) {
          return arg;
        }
      }
      return undefined;
    };
  },

  get: function (plugin) {
    var get = plugin.exports = function (args, field, context) {
      var util = plugin.require('util');
      var key = field.eval(args[0], context);
      var obj;
      if (context && key in context) {
        obj = context[key];
      } else if (_.isObject(field.value) && key in field.value) {
        obj = field.value[key];
      } else if (_.isObject(field.def.context) && key in field.def.context) {
        obj = field.def.context[key];
      } else if (field.parent) {
        obj = get(args, field.parent);
      }
      if (args.length > 1) {
        var getInKeys = field.eval(args.slice(1), context);
        return util.getIn(obj, getInKeys);
      }
      return obj;
    };
  },

  getGroupValues: function (plugin) {
    plugin.exports = function (args, field, context) {

      var groupName = field.eval(args[0], context);

      var groupFields = field.groupFields(groupName);

      return groupFields.map(function (field) {
        return field.value;
      });
    };
  },

  getMeta: function (plugin) {
    plugin.exports = function (args, field, context) {
      args = field.eval(args, context);
      return field.form.meta(args[0]);
    };
  },

  getCachedSource: function (plugin) {
    var util = plugin.require('util');
    plugin.exports = function (args, field, context) {
      args = field.eval(args, context);
      var cacheKey = util.metaCacheKey(args[0], args[1]);
      return field.form.meta(cacheKey);
    };
  },

  getMetaStatus: function (plugin) {
    plugin.exports = function (args, field, context) {
      args = field.eval(args, context);
      return field.form.metaStatus(args[0]);
    };
  },

  getCachedSourceStatus: function (plugin) {
    var util = plugin.require('util');
    plugin.exports = function (args, field, context) {
      args = field.eval(args, context);
      var cacheKey = util.metaCacheKey(args[0], args[1]);
      return field.form.metaStatus(cacheKey);
    };
  },

  hasMetaError: function (plugin) {
    var util = plugin.require('util');
    plugin.exports = function (args, field, context) {
      args = field.eval(args, context);
      var cacheKey = util.metaCacheKey(args[0], args[1]);
      return field.form.metaStatus(cacheKey) === 'error';
    };
  },

  sum: function (plugin) {
    plugin.exports = function (args, field, context) {
      var sum = 0;
      for (var i = 0; i < args.length; i++) {
        sum += field.eval(args[i], context);
      }
      return sum;
    };
  },

  forEach: function (plugin) {
    plugin.exports = function (args, field, context) {
      var itemName = args[0];
      var array = field.eval(args[1], context);
      var mapExpr = args[2];
      var filterExpr = args[3];
      context = Object.create(context || {});

      var results = [];

      for (var i = 0; i < array.length; i++) {
        var item = array[i];
        context[itemName] = item;
        if (_.isUndefined(filterExpr) || field.eval(filterExpr, context)) {
          results.push(field.eval(mapExpr, context));
        }
      }

      return results;
    };
  },

  concat: methodCall('concat'),
  split: methodCall('split'),
  reverse: methodCall('reverse'),
  join: methodCall('join'),

  humanize: function (plugin) {
    var util = plugin.require('util');
    plugin.exports = function (args, field, context) {
      return util.humanize(field.eval(args[0], context));
    };
  },

  pick: wrapFn(_.pick),
  pluck: wrapFn(_.pluck)
};

// Build a plugin bundle.
_.each(plugins, function (fn, name) {
  module.exports['eval-function.' + name] = fn;
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],42:[function(require,module,exports){
(function (global){
// # eval

/*
The eval plugin will evaluate a field's `eval` property (which must be an
object) and exchange the properties of that object for whatever the
expression returns. Expressions are just JSON except if the first element of
an array is a string that starts with '@'. In that case, the array is
treated as a Lisp expression where the first element refers to a function
that is called with the rest of the elements as the arguments. For example:

```js
['@sum', 1, 2]
```

will return the value 3. The expression could be used in an `eval` property of
a field like:

```js
{
  type: 'string',
  key: 'name',
  eval: {
    rows: ['@sum', 1, 2]
  }
}
```

The `rows` property of the field would be set to 3 in this case.

Any plugin registered with the prefix `eval-function.` will be available as a
function in these expressions.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  // Grab all the function plugins.
  var evalFunctionPlugins = plugin.requireAllOf('eval-function');

  // Just strip off the 'eval-functions.' prefix and put in a different object.
  var functions = {};
  _.each(evalFunctionPlugins, function (fn, name) {
    var fnName = name.substring(name.indexOf('.') + 1);
    functions[fnName] = fn;
  });

  // Check an array to see if it's a function expression.
  var isFunctionArray = function (array) {
    return array.length > 0 && array[0][0] === '@';
  };

  // Evaluate a function expression and return the result.
  var evalFunction = function (fnArray, field, context) {
    var fnName = fnArray[0].substring(1);
    try {
      return functions[fnName](fnArray.slice(1), field, context);
    } catch (e) {
      if (!(fnName in functions)) {
        throw new Error('Eval function ' + fnName + ' not defined.');
      }
      throw e;
    }
  };

  // Evaluate an expression in the context of a field.
  var evaluate = function (expression, field, context) {
    if (_.isArray(expression)) {
      if (isFunctionArray(expression)) {
        return evalFunction(expression, field, context);
      } else {
        return expression.map(function (item) {
          return evaluate(item, field, context);
        });
      }
    } else if (_.isObject(expression)) {
      var obj = {};
      Object.keys(expression).forEach(function (key) {
        var result = evaluate(expression[key], field, context);
        if (typeof result !== 'undefined') {
          obj[key] = result;
        }
      });
      return obj;
    } else if (_.isString(expression) && expression[0] === '=') {
      return functions.get([expression.substring(1)], field, context);
    } else {
      return expression;
    }
  };

  plugin.exports.evaluate = evaluate;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],43:[function(require,module,exports){
(function (global){
// # field-router

/*
Fields and components get glued together via routes. This is similar to URL
routing where a request gets dynamically routed to a handler. This gives a lot
of flexibility in introducing new types and components. You can create a new
type and route it to an existing component, or you can create a new component
and route existing types to it. Or you can create both and route the new type
to the new component. New routes are added via route plugins. A route plugin
simply exports an array like:

```js
[
  'color', // Route this type
  'color-picker-with-alpha', // To this component
  function (field) {
    return typeof field.def.alpha !== 'undefined';
  }
]

Route plugins can be stacked and are sensitive to ordering.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  var routes = {};

  var router = plugin.exports;

  // Get all the route plugins.
  var routePlugins = plugin.requireAll(plugin.config.routes);

  // Register a route.
  router.route = function (typeName, componentName, testFn) {
    if (!routes[typeName]) {
      routes[typeName] = [];
    }
    routes[typeName].push({
      component: componentName,
      test: testFn
    });
  };

  // Register each of the routes provided by the route plugins.
  routePlugins.forEach(function (routePlugin) {

    router.route.apply(router, routePlugin);
  });

  // Determine the best component for a field, based on the routes.
  router.componentForField = function (field) {

    var typeName = field.def.type;

    if (routes[typeName]) {
      var routesForType = routes[typeName];
      var route = _.find(routesForType, function (route) {
        return !route.test || route.test(field);
      });
      if (route) {
        return plugin.component(route.component);
      }
    }

    if (plugin.hasComponent(typeName)) {
      return plugin.component(typeName);
    }

    throw new Error('No component for field: ' + JSON.stringify(field.def));
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],44:[function(require,module,exports){
(function (global){
// # field-routes

/*
Default routes. Each route is part of its own plugin, but all are kept together
here as part of a plugin bundle.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var routes = {

  'object.static': [
    'object',
    'fieldset',
    function (field) {
      return field.def.staticKeys;
    }
  ],

  'object.default': [
    'object',
    'object'
  ],

  'string.choices': [
    'string',
    'select',
    function (field) {
      return field.def.choices ? true : false;
    }
  ],

  'string.tags': [
    'string',
    'pretty-textarea',
    function (field) {
      return field.def.replaceChoices;
    }
  ],

  'string.single-line': [
    'string',
    'text',
    function (field) {
      return field.def.maxRows === 1;
    }
  ],

  // Not sure what to do with nulls.
  'null.default': [
    'null',
    'textarea'
  ],

  'string.default': [
    'string',
    'textarea'
  ],

  'array.choices': [
    'array',
    'checkbox-list',
    function (field) {
      return field.def.choices ? true : false;
    }
  ],

  'array.default': [
    'array',
    'list'
  ],

  'boolean.default': [
    'boolean',
    'select'
  ],

  'number.default': [
    'number',
    'text'
  ]

};

// Build a plugin bundle.
_.each(routes, function (route, name) {
  module.exports['field-route.' + name] = function (plugin) {
    plugin.exports = route;
  };
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],45:[function(require,module,exports){
// # loader

/*
When metadata isn't available, we ask the loader to load it. The loader will
try to find an appropriate source based on the metadata keys.

Note that we ask the loader to load metadata with a set of keys like
`['foo', 'bar']`, but those are converted to a single key like `foo::bar` for
the sake of caching.
*/

'use strict';

module.exports = function (plugin) {

  var util = plugin.require('util');

  var loader = plugin.exports;

  var isLoading = {};
  var sources = {};

  // Load metadata for a given form and params.
  loader.loadMeta = function (form, source, params) {
    var cacheKey = util.metaCacheKey(source, params);

    if (isLoading[cacheKey]) {
      return;
    }

    isLoading[cacheKey] = true;

    loader.loadAsyncFromSource(form, source, params);
  };

  // Make sure to load metadata asynchronously.
  loader.loadAsyncFromSource = function (form, source, params, waitTime) {
    setTimeout(function () {
      loader.loadFromSource(form, source, params);
    }, waitTime || 0);
  };

  // Load metadata for a form and params.
  loader.loadFromSource = function (form, sourceName, params) {

    // Find the best source for this cache key.
    var source = sources[sourceName];
    if (source) {

      var cacheKey = util.metaCacheKey(sourceName, params);

      // Call the source function.
      var result = source.call(null, params);

      if (result) {
        // Result could be a promise.
        if (result.then) {
          var promise = result.then(function (result) {
            form.meta(cacheKey, result);
            isLoading[cacheKey] = false;
          });

          var onError = function () {
            form.meta(cacheKey, null, 'error');
            isLoading[cacheKey] = false;
          };

          if (promise.catch) {
            promise.catch(onError);
          } else {
            // silly jQuery promises
            promise.fail(onError);
          }
        // Or it could be a value. In that case, make sure to asyncify it.
        } else {
          setTimeout(function () {
            form.meta(cacheKey, result);
            isLoading[cacheKey] = false;
          }, 0);
        }
      } else {
        isLoading[cacheKey] = false;
      }

    } else {
      isLoading[cacheKey] = false;
    }
  };

  // Register a source function.
  loader.source = function (name, fn) {

    sources[name] = fn;
  };

};

},{}],46:[function(require,module,exports){
(function (global){
// # util

// Some utility functions to be used by other plugins.

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  var util = plugin.exports;

  // Check if a value is "blank".
  util.isBlank = function (value) {
    return value === undefined || value === null || value === '';
  };

  // Set value at some path in object.
  util.setIn = function (obj, path, value) {
    if (_.isString(path)) {
      path = [path];
    }
    if (path.length === 0) {
      return value;
    }
    if (path.length === 1) {
      obj[path[0]] = value;
      return obj;
    }
    if (!obj[path[0]]) {
      obj[path[0]] = {};
    }
    util.setIn(obj[path[0]], path.slice(1), value);
    return obj;
  };

  // Remove value at path in some object.
  util.removeIn = function (obj, path) {
    if (_.isString(path)) {
      path = [path];
    }
    if (path.length === 0) {
      return null;
    }
    if (path.length === 1) {
      if (_.isArray(obj)) {
        if (_.isNumber(path[0])) {
          obj.splice(path[0], 1);
        }
      } else if (_.isObject(obj)) {
        delete obj[path[0]];
      }
      return obj;
    }
    if (obj[path[0]]) {
      util.removeIn(obj[path[0]], path.slice(1));
    }
    return obj;
  };

  // Get value at path in some object.
  util.getIn = function (obj, path) {
    if (_.isString(path)) {
      path = [path];
    }
    if (path.length === 0) {
      return obj;
    }
    if (_.isObject(obj) && path[0] in obj) {
      return util.getIn(obj[path[0]], path.slice(1));
    }
    return null;
  };

  // Append to array at path in some object.
  util.appendIn = function (obj, path, value) {
    var subObj = util.getIn(obj, path);
    if (_.isArray(subObj)) {
      subObj.push(value);
    }
    return obj;
  };

  // Swap two keys at path in some object.
  util.moveIn = function (obj, path, fromKey, toKey) {
    var subObj = util.getIn(obj, path);
    if (_.isArray(subObj)) {
      if (_.isNumber(fromKey) && _.isNumber(toKey)) {
        var fromIndex = fromKey;
        var toIndex = toKey;
        if (fromIndex !== toIndex &&
          fromIndex >= 0 && fromIndex < subObj.length &&
          toIndex >= 0 && toIndex < subObj.length
        ) {
          subObj.splice(toIndex, 0, subObj.splice(fromIndex, 1)[0]);
        }
      }
    } else {
      subObj[toKey] = subObj[fromKey];
      delete subObj[fromKey];
    }
    return obj;
  };

  // Copy obj, leaving non-JSON behind.
  util.copyValue = function (value) {
    return JSON.parse(JSON.stringify(value));
  };

  // Copy obj recursing deeply.
  util.deepCopy = function (obj) {
    if (_.isArray(obj)) {
      return obj.map(function (item) {
        return util.deepCopy(item);
      });
    } else if (_.isObject(obj)) {
      var copy = {};
      _.each(obj, function (value, key) {
        copy[key] = util.deepCopy(value);
      });
      return copy;
    } else {
      return obj;
    }
  };

  // Check if item matches some value, based on the item's `match` property.
  util.itemMatchesValue = function (item, value) {
    var match = item.match;
    if (!match) {
      return true;
    }
    return _.every(_.keys(match), function (key) {
      return _.isEqual(match[key], value[key]);
    });
  };

  // Create a field definition from a value.
  util.fieldDefFromValue = function (value) {
    var def = {
      type: 'json'
    };
    if (_.isString(value)) {
      def = {
        type: 'string'
      };
    } else if (_.isNumber(value)) {
      def = {
        type: 'number'
      };
    } else if (_.isBoolean(value)) {
      def = {
        type: 'boolean'
      };
    } else if (_.isArray(value)) {
      var arrayItemFields = value.map(function (value, i) {
        var childDef = util.fieldDefFromValue(value);
        childDef.key = i;
        return childDef;
      });
      def = {
        type: 'array',
        fields: arrayItemFields
      };
    } else if (_.isObject(value)) {
      var objectItemFields = Object.keys(value).map(function (key) {
        var childDef = util.fieldDefFromValue(value[key]);
        childDef.key = key;
        childDef.label = util.humanize(key);
        return childDef;
      });
      def = {
        type: 'object',
        fields: objectItemFields
      };
    } else if (_.isNull(value)) {
      def = {
        type: 'null'
      };
    }
    return def;
  };

  if (plugin.config.humanize) {
    // Get the humanize function from a plugin if provided.
    util.humanize = plugin.require(plugin.config.humanize);
  } else {
    // Convert property keys to "human" labels. For example, 'foo' becomes
    // 'Foo'.
    util.humanize = function(property) {
      property = property.replace(/\{\{/g, '');
      property = property.replace(/\}\}/g, '');
      return property.replace(/_/g, ' ')
        .replace(/(\w+)/g, function(match) {
          return match.charAt(0).toUpperCase() + match.slice(1);
        });
    };
  }

  // Join multiple CSS class names together, ignoring any that aren't there.
  util.className = function () {

    var classNames = Array.prototype.slice.call(arguments, 0);

    classNames = classNames.filter(function (name) {
      return name;
    });

    return classNames.join(' ');
  };

  // Join keys together to make single "meta" key. For looking up metadata in
  // the metadata part of the store.
  util.joinMetaKeys = function (keys) {
    return keys.join('::');
  };

  // Split a joined key into separate key parts.
  util.splitMetaKey = function (key) {
    return key.split('::');
  };

  util.metaCacheKey = function (source, params) {
    params = params || {};
    return source + '::params(' + JSON.stringify(params) + ')';
  };

  util.metaErrorCacheKey = function (source, params) {
    params = params || {};
    return source + '::params(' + JSON.stringify(params) + ')::error';
  };

  // Wrap a text value so it has a type. For parsing text with tags.
  var textPart = function (value, type) {
    type = type || 'text';
    return {
      type: type,
      value: value
    };
  };

  // Parse text that has tags like {{tag}} into text and tags.
  util.parseTextWithTags = function (value) {
    value = value || '';
    var parts = value.split(/{{(?!{)/);
    var frontPart = [];
    if (parts[0] !== '') {
      frontPart = [
        textPart(parts[0])
      ];
    }
    parts = frontPart.concat(
      parts.slice(1).map(function (part) {
        if (part.indexOf('}}') >= 0) {
          return [
            textPart(part.substring(0, part.indexOf('}}')), 'tag'),
            textPart(part.substring(part.indexOf('}}') + 2))
          ];
        } else {
          return textPart('{{' + part, 'text');
        }
      })
    );
    return [].concat.apply([], parts);
  };

  // Copy all computed styles from one DOM element to another.
  util.copyElementStyle = function (fromElement, toElement) {
    var fromStyle = window.getComputedStyle(fromElement, '');

    if (fromStyle.cssText !== '') {
      toElement.style.cssText = fromStyle.cssText;
      return;
    }

    var cssRules = [];
    for (var i = 0; i < fromStyle.length; i++) {
      //console.log(i, fromStyle[i], fromStyle.getPropertyValue(fromStyle[i]))
      //toElement.style[fromStyle[i]] = fromStyle.getPropertyValue(fromStyle[i]);
      cssRules.push(fromStyle[i] + ':' + fromStyle.getPropertyValue(fromStyle[i]) + ';');
    }
    var cssText = cssRules.join('');

    toElement.style.cssText = cssText;
  };

  // Object to hold browser sniffing info.
  var browser = {
    isChrome: false,
    isMozilla: false,
    isOpera: false,
    isIe: false,
    isSafari: false
  };

  // Sniff the browser.
  var ua = navigator.userAgent;
  if(ua.indexOf('Chrome') > -1) {
    browser.isChrome = true;
  } else if (ua.indexOf('Safari') > -1) {
    browser.isSafari = true;
  } else if (ua.indexOf('Opera') > -1) {
    browser.isOpera = true;
  } else if (ua.indexOf('Firefox') > -1) {
    browser.isMozilla = true;
  } else if (ua.indexOf('MSIE') > -1) {
    browser.isIe = true;
  }

  util.browser = browser;

};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],47:[function(require,module,exports){
(function (global){
'use strict';

var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);
var R = React.DOM;
var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

// # Formatic plugin core

// At its core, Formatic is just a plugin host. All of the functionality it has
// out of the box is via plugins. These plugins can be replaced or extended by
// other plugins.

// The global plugin registry holds registered (but not yet instantiated)
// plugins.
var pluginRegistry = {};

// Group plugins by prefix.
var pluginGroups = {};

// For anonymous plugins, incrementing number for names.
var pluginId = 0;

// Register a plugin or plugin bundle (array of plugins) globally.
var registerPlugin = function (name, pluginInitFn) {

  if (pluginRegistry[name]) {
    throw new Error('Plugin ' + name + ' is already registered.');
  }

  if (_.isArray(pluginInitFn)) {
    pluginRegistry[name] = [];
    pluginInitFn.forEach(function (pluginSpec) {
      registerPlugin(pluginSpec.name, pluginSpec.plugin);
      pluginRegistry[name].push(pluginSpec.name);
    });
  } else if (_.isObject(pluginInitFn) && !_.isFunction(pluginInitFn)) {
    var bundleName = name;
    pluginRegistry[bundleName] = [];
    Object.keys(pluginInitFn).forEach(function (name) {
      registerPlugin(name, pluginInitFn[name]);
      pluginRegistry[bundleName].push(name);
    });
  } else {
    pluginRegistry[name] = pluginInitFn;
    // Add plugin name to plugin group if it has a prefix.
    if (name.indexOf('.') > 0) {
      var prefix = name.substring(0, name.indexOf('.'));
      pluginGroups[prefix] = pluginGroups[prefix] || [];
      pluginGroups[prefix].push(name);
    }
  }
};

// Default plugin config. Each key represents a plugin name. Each key of that
// plugin represents a setting for that plugin. Passed-in config will override
// each individual setting.
var defaultPluginConfig = {
  core: {
    formatic: ['core.formatic'],
    form: ['core.form-init', 'core.form', 'core.field']
  },
  'core.form': {
    store: 'store.memory'
  },
  'field-router': {
    routes: ['field-routes']
  },
  compiler: {
    compilers: ['compiler.choices', 'compiler.lookup', 'compiler.types', 'compiler.prop-aliases']
  },
  component: {
    props: ['default-style']
  }
};

// ## Formatic factory

// Create a new formatic instance. A formatic instance is a function that can
// create forms. It also has a `.create` method that can create other formatic
// instances.
var createFormaticCore = function (config) {

  // Make a copy of config so we can monkey with it.
  config = _.extend({}, config);

  // Add default config settings (where not overridden).
  _.keys(defaultPluginConfig).forEach(function (key) {
    config[key] = _.extend({}, defaultPluginConfig[key], config[key]);
  });

  // The `formatic` variable will hold the function that gets returned from the
  // factory.
  var formatic;

  // Instantiated plugins are cached just like CommonJS modules.
  var pluginCache = {};

  // ## Plugin prototype

  // The Plugin prototype exists inside the Formatic factory function just to
  // make it easier to grab values from the closure.

  // Plugins are similar to CommonJS modules. Formatic uses plugins as a slight
  // variant though because:
  // - Formatic plugins are configurable.
  // - Formatic plugins are instantiated per formatic instance. CommonJS modules
  //   are created once and would be shared across all formatic instances.
  // - Formatic plugins are easily overridable (also via configuration).

  // When a plugin is instantiated, we call the `Plugin` constructor. The plugin
  // instance is then passed to the plugin's initialization function.
  var Plugin = function (name, config) {
    if (!(this instanceof Plugin)) {
      return new Plugin(name, config);
    }
    // Exports analogous to CommonJS exports.
    this.exports = {};
    // Config values passed in via factory are routed to the appropriate
    // plugin and available via `.config`.
    this.config = config || {};
    this.name = name;
  };

  // Get a config value for a plugin or return the default value.
  Plugin.prototype.configValue = function (key, defaultValue) {

    if (typeof this.config[key] !== 'undefined') {
      return this.config[key];
    }
    return defaultValue || '';
  };

  // Require another plugin by name. This is much like a CommonJS require
  Plugin.prototype.require = function (name) {
    return formatic.plugin(name);
  };

  // Handle a special plugin, the `component` plugin which finds components.
  var componentPlugin;

  // Just here in case we want to dynamically choose component later.
  Plugin.prototype.component = function (name) {
    return componentPlugin.component(name);
  };

  // Check if a plugin exists.
  Plugin.prototype.hasPlugin = function (name) {
    return (name in pluginCache) || (name in pluginRegistry);
  };

  // Check if a component exists. Components are really just plugins with
  // a particular prefix to their names.
  Plugin.prototype.hasComponent = function (name) {
    return this.hasPlugin('component.' + name);
  };

  // Given a list of plugin names, require them all and return a list of
  // instantiated plugins.
  Plugin.prototype.requireAll = function (pluginList) {
    if (!pluginList) {
      pluginList = [];
    }
    if (!_.isArray(pluginList)) {
      pluginList = [pluginList];
    }
    // Inflate registered bundles. A bundle is just a name that points to an
    // array of other plugin names.
    pluginList = pluginList.map(function (plugin) {
      if (_.isString(plugin)) {
        if (_.isArray(pluginRegistry[plugin])) {
          return pluginRegistry[plugin];
        }
      }
      return plugin;
    });
    // Flatten any bundles, so we end up with a flat array of plugin names.
    pluginList = _.flatten(pluginList);
    return pluginList.map(function (plugin) {
      return this.require(plugin);
    }.bind(this));
  };

  // Given a prefix, return a map of all instantiated plugins with that prefix.
  Plugin.prototype.requireAllOf = function (prefix) {
    var map = {};

    if (pluginGroups[prefix]) {
      pluginGroups[prefix].forEach(function (name) {
        map[name] = this.require(name);
      }.bind(this));
    }

    return map;
  };

  // ## Formatic factory, continued...

  // Grab a plugin from the cache, or load it fresh from the registry.
  var loadPlugin = function (name, pluginConfig) {
    var plugin;

    // We can also load anonymous plugins.
    if (_.isFunction(name)) {

      var factory = name;

      if (_.isUndefined(factory.__exports__)) {
        pluginId++;
        plugin = Plugin('anonymous_plugin_' + pluginId, pluginConfig || {});
        factory(plugin);
        // Store the exports on the anonymous function so we know it's already
        // been instantiated, and we can just grab the exports.
        factory.__exports__ = plugin.exports;
      }

      // Load the cached exports.
      return factory.__exports__;

    } else if (_.isUndefined(pluginCache[name])) {

      if (!pluginConfig && config[name]) {
        if (config[name].plugin) {
          return loadPlugin(config[name].plugin, config[name] || {});
        }
      }

      if (pluginRegistry[name]) {
        if (_.isFunction(pluginRegistry[name])) {
          plugin = Plugin(name, pluginConfig || config[name]);
          pluginRegistry[name](plugin);
          pluginCache[name] = plugin.exports;
        } else {
          throw new Error('Plugin ' + name + ' is not a function.');
        }
      } else {
        throw new Error('Plugin ' + name + ' not found.');
      }
    }
    return pluginCache[name];
  };

  // Assign `formatic` to a function that takes form options and returns a form.
  formatic = function (options) {
    return formatic.form(options);
  };

  // Allow global plugin registry from the formatic function instance.
  formatic.register = function (name, pluginInitFn) {
    registerPlugin(name, pluginInitFn);
    return formatic;
  };

  // Allow retrieving plugins from the formatic function instance.
  formatic.plugin = function (name) {
    return loadPlugin(name);
  };

  // Allow creating a new formatic instance from a formatic instance.
  //formatic.create = Formatic;

  // Use the core plugin to add methods to the formatic instance.
  var core = loadPlugin('core');

  core(formatic);

  // Now bind the component plugin. We wait till now, so the core is loaded
  // first.
  componentPlugin = loadPlugin('component');

  // Return the formatic function instance.
  return formatic;
};

// Just a helper to register a bunch of plugins.
var registerPlugins = function () {
  var arg = _.toArray(arguments);
  arg.forEach(function (arg) {
    var name = arg[0];
    var plugin = arg[1];
    registerPlugin(name, plugin);
  });
};

// Register all the built-in plugins.
registerPlugins(
  ['core', require('./default/core')],

  ['core.formatic', require('./core/formatic')],
  ['core.form-init', require('./core/form-init')],
  ['core.form', require('./core/form')],
  ['core.field', require('./core/field')],

  ['util', require('./default/util')],
  ['compiler', require('./default/compiler')],
  ['eval', require('./default/eval')],
  ['eval-functions', require('./default/eval-functions')],
  ['loader', require('./default/loader')],
  ['field-router', require('./default/field-router')],
  ['field-routes', require('./default/field-routes')],

  ['compiler.choices', require('./compilers/choices')],
  ['compiler.lookup', require('./compilers/lookup')],
  ['compiler.types', require('./compilers/types')],
  ['compiler.prop-aliases', require('./compilers/prop-aliases')],

  ['store.memory', require('./store/memory')],

  ['type.root', require('./types/root')],
  ['type.string', require('./types/string')],
  ['type.null', require('./types/null')],
  ['type.object', require('./types/object')],
  ['type.boolean', require('./types/boolean')],
  ['type.array', require('./types/array')],
  ['type.json', require('./types/json')],
  ['type.number', require('./types/number')],

  ['component', require('./default/component')],

  ['component.root', require('./components/root')],
  ['component.field', require('./components/field')],
  ['component.label', require('./components/label')],
  ['component.help', require('./components/help')],
  ['component.sample', require('./components/sample')],
  ['component.fieldset', require('./components/fieldset')],
  ['component.text', require('./components/text')],
  ['component.textarea', require('./components/textarea')],
  ['component.select', require('./components/select')],
  ['component.list', require('./components/list')],
  ['component.list-control', require('./components/list-control')],
  ['component.list-item', require('./components/list-item')],
  ['component.list-item-value', require('./components/list-item-value')],
  ['component.list-item-control', require('./components/list-item-control')],
  ['component.item-choices', require('./components/item-choices')],
  ['component.add-item', require('./components/add-item')],
  ['component.remove-item', require('./components/remove-item')],
  ['component.move-item-back', require('./components/move-item-back')],
  ['component.move-item-forward', require('./components/move-item-forward')],
  ['component.json', require('./components/json')],
  ['component.checkbox-list', require('./components/checkbox-list')],
  ['component.pretty-textarea', require('./components/pretty-textarea')],
  ['component.choices', require('./components/choices')],
  ['component.object', require('./components/object')],
  ['component.object-control', require('./components/object-control')],
  ['component.object-item', require('./components/object-item')],
  ['component.object-item-key', require('./components/object-item-key')],
  ['component.object-item-value', require('./components/object-item-value')],
  ['component.object-item-control', require('./components/object-item-control')],

  ['mixin.click-outside', require('./mixins/click-outside')],
  ['mixin.field', require('./mixins/field')],
  ['mixin.input-actions', require('./mixins/input-actions')],
  ['mixin.resize', require('./mixins/resize')],
  ['mixin.scroll', require('./mixins/scroll')],
  ['mixin.undo-stack', require('./mixins/undo-stack')],

  ['bootstrap-style', require('./plugins/bootstrap-style')],
  ['default-style', require('./plugins/default-style')]
);

// Create the default formatic instance.
//var defaultCore = Formatic();

// Export it!
//module.exports = defaultFormatic;

var createFormaticComponentClass = function (config) {

  var core = createFormaticCore(config);

  return React.createClass({

    displayName: 'Formatic',

    statics: {
      config: createFormaticComponentClass,
      form: core,
      plugin: core.plugin,
      registerPlugin: registerPlugin
    },

    getInitialState: function () {
      var form = this.props.form || this.props.defaultForm;
      return {
        form: form,
        field: form.field(),
        controlled: this.props.form ? true : false
      };
    },

    componentDidMount: function() {
      var form = this.state.form;
      if (!form) {
        throw new Error('Must supply a form or defaultForm.');
      }
      if (this.state.controlled) {
        form.once('change', this.onFormChanged);
      } else {
        form.on('change', this.onFormChanged);
      }
    },

    onFormChanged: function (event) {
      if (event.changing.action === 'setMeta' || event.changing.action === 'setFields' || event.changing.action === 'reset') {
        this.setState({
          field: this.state.form.field()
        });
        // Meta events and reset event don't make it out for now.
        return;
      }

      if (this.props.onChange) {
        this.props.onChange(this.state.form.val(), event.changing);
      }
      if (!this.state.controlled) {
        this.setState({
          field: this.state.form.field()
        });
      }
    },

    componentWillUnmount: function () {
      var form = this.state.form;
      if (form) {
        form.off('change', this.onFormChanged);
      }
    },

    componentWillReceiveProps: function (nextProps) {
      if (this.state.controlled) {
        if (!nextProps.form) {
          throw new Error('Must supply a new form for a controlled component.');
        }
        nextProps.form.once('change', this.onFormChanged);
        this.setState({
          form: nextProps.form,
          field: nextProps.form.field()
        });
      }
    },

    render: function () {
      return R.div({className: 'formatic'},
        this.state.field.component({onFocus: this.props.onFocus, onBlur: this.props.onBlur})
      );
    }
  });
};

module.exports = createFormaticComponentClass();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./compilers/choices":1,"./compilers/lookup":2,"./compilers/prop-aliases":3,"./compilers/types":4,"./components/add-item":5,"./components/checkbox-list":6,"./components/choices":7,"./components/field":8,"./components/fieldset":9,"./components/help":10,"./components/item-choices":11,"./components/json":12,"./components/label":13,"./components/list":18,"./components/list-control":14,"./components/list-item":17,"./components/list-item-control":15,"./components/list-item-value":16,"./components/move-item-back":19,"./components/move-item-forward":20,"./components/object":26,"./components/object-control":21,"./components/object-item":25,"./components/object-item-control":22,"./components/object-item-key":23,"./components/object-item-value":24,"./components/pretty-textarea":27,"./components/remove-item":28,"./components/root":29,"./components/sample":30,"./components/select":31,"./components/text":32,"./components/textarea":33,"./core/field":34,"./core/form":36,"./core/form-init":35,"./core/formatic":37,"./default/compiler":38,"./default/component":39,"./default/core":40,"./default/eval":42,"./default/eval-functions":41,"./default/field-router":43,"./default/field-routes":44,"./default/loader":45,"./default/util":46,"./mixins/click-outside":48,"./mixins/field":49,"./mixins/input-actions":50,"./mixins/resize":51,"./mixins/scroll":52,"./mixins/undo-stack":53,"./plugins/bootstrap-style":54,"./plugins/default-style":55,"./store/memory":56,"./types/array":57,"./types/boolean":58,"./types/json":59,"./types/null":60,"./types/number":61,"./types/object":62,"./types/root":63,"./types/string":64}],48:[function(require,module,exports){
(function (global){
// # mixin.click-outside

/*
There's no native React way to detect clicking outside an element. Sometimes
this is useful, so that's what this mixin does. To use it, mix it in and use it
from your component like this:

```js
module.exports = function (plugin) {
  plugin.exports = React.createClass({

    mixins: [plugin.require('mixin.click-outside')],

    onClickOutside: function () {
      console.log('clicked outside!');
    },

    componentDidMount: function () {
      this.setOnClickOutside('myDiv', this.onClickOutside);
    },

    render: function () {
      return React.DOM.div({ref: 'myDiv'},
        'Hello!'
      )
    }
  });
};
```
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var hasAncestor = function (child, parent) {
  if (child.parentNode === parent) {
    return true;
  }
  if (child.parentNode === null) {
    return false;
  }
  return hasAncestor(child.parentNode, parent);
};

module.exports = function (plugin) {

  plugin.exports = {

    // _onClickDocument: function(event) {
    //   console.log('click doc')
    //   if (this._didMouseDown) {
    //     _.each(this.clickOutsideHandlers, function (funcs, ref) {
    //       if (isOutside(event.target, this.refs[ref].getDOMNode())) {
    //         funcs.forEach(function (fn) {
    //           fn.call(this);
    //         }.bind(this));
    //       }
    //     }.bind(this));
    //   }
    // },

    isNodeOutside: function (nodeOut, nodeIn) {
      if (nodeOut === nodeIn) {
        return false;
      }
      if (hasAncestor(nodeOut, nodeIn)) {
        return false;
      }
      return true;
    },

    isNodeInside: function (nodeIn, nodeOut) {
      return !this.isNodeOutside(nodeIn, nodeOut);
    },

    _onClickMousedown: function() {
      //this._didMouseDown = true;
      _.each(this.clickOutsideHandlers, function (funcs, ref) {
        if (this.refs[ref]) {
          this._mousedownRefs[ref] = true;
        }
      }.bind(this));
    },

    _onClickMouseup: function (event) {
      _.each(this.clickOutsideHandlers, function (funcs, ref) {
        if (this.refs[ref] && this._mousedownRefs[ref]) {
          if (this.isNodeOutside(event.target, this.refs[ref].getDOMNode())) {
            funcs.forEach(function (fn) {
              fn.call(this, event);
            }.bind(this));
          }
        }
        this._mousedownRefs[ref] = false;
      }.bind(this));
    },

    // _onClickDocument: function () {
    //   console.log('clickety')
    //   _.each(this.clickOutsideHandlers, function (funcs, ref) {
    //     console.log('clickety', ref, this.refs[ref])
    //   }.bind(this));
    // },

    setOnClickOutside: function (ref, fn) {
      if (!this.clickOutsideHandlers[ref]) {
        this.clickOutsideHandlers[ref] = [];
      }
      this.clickOutsideHandlers[ref].push(fn);
    },

    componentDidMount: function () {
      this.clickOutsideHandlers = {};
      this._didMouseDown = false;
      document.addEventListener('mousedown', this._onClickMousedown);
      document.addEventListener('mouseup', this._onClickMouseup);
      //document.addEventListener('click', this._onClickDocument);
      this._mousedownRefs = {};
    },

    componentWillUnmount: function () {
      this.clickOutsideHandlers = {};
      //document.removeEventListener('click', this._onClickDocument);
      document.removeEventListener('mouseup', this._onClickMouseup);
      document.removeEventListener('mousedown', this._onClickMousedown);
    }
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],49:[function(require,module,exports){
(function (global){
// # mixin.field

/*
Wrap up your fields with this mixin to get:
- Automatic metadata loading.
- Anything else decided later.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  var normalizeMeta = function (meta) {
    var needsSource = [];

    meta.forEach(function (args) {


      if (_.isArray(args) && args.length > 0) {
        if (_.isArray(args[0])) {
          args.forEach(function (args) {
            needsSource.push(args);
          });
        } else {
          needsSource.push(args);
        }
      }
    });

    if (needsSource.length === 0) {
      // Must just be a single need, and not an array.
      needsSource = [meta];
    }

    return needsSource;
  };

  plugin.exports = {

    loadNeededMeta: function (props) {
      if (props.field && props.field.form) {
        if (props.field.def.needsSource && props.field.def.needsSource.length > 0) {

          var needsSource = normalizeMeta(props.field.def.needsSource);

          needsSource.forEach(function (needs) {
            if (needs) {
              props.field.form.loadMeta.apply(props.field.form, needs);
            }
          });
        }
      }
    },

    // currently unused; will use to unload metadata on change
    unloadOtherMeta: function () {
      var props = this.props;
      if (props.field.def.refreshMeta) {
        var refreshMeta = normalizeMeta(props.field.def.refreshMeta);
        props.field.form.unloadOtherMeta(refreshMeta);
      }
    },

    componentDidMount: function () {
      this.loadNeededMeta(this.props);
    },

    componentWillReceiveProps: function (nextProps) {
      this.loadNeededMeta(nextProps);
    },

    componentWillUnmount: function () {
      // Removing this as it's a bad idea, because unmounting a component is not
      // always a signal to remove the field. Will have to find a better way.

      // if (this.props.field) {
      //   this.props.field.erase();
      // }
    },

    onFocus: function () {
      if (this.props.onFocus) {
        this.props.onFocus({path: this.props.field.valuePath(), field: this.props.field.def});
      }
    },

    onBlur: function () {
      if (this.props.onBlur) {
        this.props.onBlur({path: this.props.field.valuePath(), field: this.props.field.def});
      }
    }
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],50:[function(require,module,exports){
// # mixin.input-actions

/*
Currently unused.
*/

'use strict';

module.exports = function (plugin) {

  plugin.exports = {

    onFocus: function () {

    },

    onBlur: function () {

    },

    onChange: function () {

    }
  };
};

},{}],51:[function(require,module,exports){
// # mixin.resize

/*
You'd think it would be pretty easy to detect when a DOM element is resized.
And you'd be wrong. There are various tricks, but none of them work very well.
So, using good ol' polling here. To try to be as efficient as possible, there
is only a single setInterval used for all elements. To use:

```js
module.exports = function (plugin) {
  plugin.exports = React.createClass({

    mixins: [plugin.require('mixin.resize')],

    onResize: function () {
      console.log('resized!');
    },

    componentDidMount: function () {
      this.setOnResize('myText', this.onResize);
    },

    onChange: function () {
      ...
    },

    render: function () {
      return React.DOM.textarea({ref: 'myText', value: this.props.value, onChange: ...})
    }
  });
};
```
*/

'use strict';

var id = 0;

var resizeIntervalElements = {};
var resizeIntervalElementsCount = 0;
var resizeIntervalTimer = null;

var checkElements = function () {
  Object.keys(resizeIntervalElements).forEach(function (key) {
    var element = resizeIntervalElements[key];
    if (element.clientWidth !== element.__prevClientWidth || element.clientHeight !== element.__prevClientHeight) {
      element.__prevClientWidth = element.clientWidth;
      element.__prevClientHeight = element.clientHeight;
      var handlers = element.__resizeHandlers;
      handlers.forEach(function (handler) {
        handler();
      });
    }
  }, 100);
};

var addResizeIntervalHandler = function (element, fn) {
  if (resizeIntervalTimer === null) {
    resizeIntervalTimer = setInterval(checkElements, 100);
  }
  if (!('__resizeId' in element)) {
    id++;
    element.__prevClientWidth = element.clientWidth;
    element.__prevClientHeight = element.clientHeight;
    element.__resizeId = id;
    resizeIntervalElementsCount++;
    resizeIntervalElements[id] = element;
    element.__resizeHandlers = [];
  }
  element.__resizeHandlers.push(fn);
};

var removeResizeIntervalHandlers = function (element) {
  if (!('__resizeId' in element)) {
    return;
  }
  var id = element.__resizeId;
  delete element.__resizeId;
  delete element.__resizeHandlers;
  delete resizeIntervalElements[id];
  resizeIntervalElementsCount--;
  if (resizeIntervalElementsCount < 1) {
    clearInterval(resizeIntervalTimer);
    resizeIntervalTimer = null;
  }
};

var onResize = function (ref, fn) {
  fn(ref);
};

module.exports = function (plugin) {

  plugin.exports = {

    componentDidMount: function () {
      if (this.onResizeWindow) {
        window.addEventListener('resize', this.onResizeWindow);
      }
      this.resizeElementRefs = {};
    },

    componentWillUnmount: function () {
      if (this.onResizeWindow) {
        window.removeEventListener('resize', this.onResizeWindow);
      }
      Object.keys(this.resizeElementRefs).forEach(function (ref) {
        removeResizeIntervalHandlers(this.refs[ref].getDOMNode());
      }.bind(this));
    },

    setOnResize: function (ref, fn) {
      if (!this.resizeElementRefs[ref]) {
        this.resizeElementRefs[ref] = true;
      }
      addResizeIntervalHandler(this.refs[ref].getDOMNode(), onResize.bind(this, ref, fn));
    }
  };
};

},{}],52:[function(require,module,exports){
// # mixin.scroll

'use strict';

module.exports = function (plugin) {

  plugin.exports = {

    componentDidMount: function () {
      if (this.onScrollWindow) {
        window.addEventListener('scroll', this.onScrollWindow);
      }
    },

    componentWillUnmount: function () {
      if (this.onScrollWindow) {
        window.removeEventListener('scroll', this.onScrollWindow);
      }
    }
  };
};

},{}],53:[function(require,module,exports){
// # mixin.undo-stack

/*
Gives your component an undo stack.
*/

// http://prometheusresearch.github.io/react-forms/examples/undo.html

'use strict';

var UndoStack = {
  getInitialState: function() {
    return {undo: [], redo: []};
  },

  snapshot: function() {
    var undo = this.state.undo.concat(this.getStateSnapshot());
    if (typeof this.state.undoDepth === 'number') {
      if (undo.length > this.state.undoDepth) {
        undo.shift();
      }
    }
    this.setState({undo: undo, redo: []});
  },

  hasUndo: function() {
    return this.state.undo.length > 0;
  },

  hasRedo: function() {
    return this.state.redo.length > 0;
  },

  redo: function() {
    this._undoImpl(true);
  },

  undo: function() {
    this._undoImpl();
  },

  _undoImpl: function(isRedo) {
    var undo = this.state.undo.slice(0);
    var redo = this.state.redo.slice(0);
    var snapshot;

    if (isRedo) {
      if (redo.length === 0) {
        return;
      }
      snapshot = redo.pop();
      undo.push(this.getStateSnapshot());
    } else {
      if (undo.length === 0) {
        return;
      }
      snapshot = undo.pop();
      redo.push(this.getStateSnapshot());
    }

    this.setStateSnapshot(snapshot);
    this.setState({undo:undo, redo:redo});
  }
};

module.exports = function (plugin) {
  plugin.exports = UndoStack;
};

},{}],54:[function(require,module,exports){
(function (global){
// # bootstrap

/*
The bootstrap plugin bundle exports a bunch of "prop modifier" plugins which
manipulate the props going into many of the components.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var modifiers = {

  'field': {className: 'form-group'},
  'help': {className: 'help-block'},
  'sample': {className: 'help-block'},
  'text': {className: 'form-control'},
  'textarea': {className: 'form-control'},
  'pretty-textarea': {className: 'form-control'},
  'json': {className: 'form-control'},
  'select': {className: 'form-control'},
  //'list': {className: 'well'},
  'list-control': {className: 'form-inline'},
  'list-item': {className: 'well'},
  'item-choices': {className: 'form-control'},
  'add-item': {className: 'glyphicon glyphicon-plus', label: ''},
  'remove-item': {className: 'glyphicon glyphicon-remove', label: ''},
  'move-item-back': {className: 'glyphicon glyphicon-arrow-up', label: ''},
  'move-item-forward': {className: 'glyphicon glyphicon-arrow-down', label: ''},
  'object-item-key': {className: 'form-control'}
};

// Build the plugin bundle.
_.each(modifiers, function (modifier, name) {

  exports['component-props.' + name + '.bootstrap'] = function (plugin) {

    var util = plugin.require('util');

    plugin.exports = [
      name,
      function (props) {
        if (!_.isUndefined(modifier.className)) {
          props.className = util.className(props.className, modifier.className);
        }
        if (!_.isUndefined(modifier.label)) {
          props.label = modifier.label;
        }
      }
    ];
  };

});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],55:[function(require,module,exports){
(function (global){
// # default-style

/*
The default-style plugin bundle exports a bunch of "prop modifier" plugins which
manipulate the props going into many of the components.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

var modifiers = {

  'field': {},
  'help': {},
  'sample': {},
  'text': {},
  'textarea': {},
  'pretty-textarea': {},
  'json': {},
  'select': {},
  'list': {},
  'list-control': {},
  'list-item-control': {},
  'list-item-value': {},
  'list-item': {},
  'item-choices': {},
  'add-item': {},
  'remove-item': {},
  'move-item-back': {},
  'move-item-forward': {}
};

// Build the plugin bundle.
_.each(modifiers, function (modifier, name) {

  exports['component-props.' + name + '.default'] = function (plugin) {

    var util = plugin.require('util');

    plugin.exports = [
      name,
      function (props) {
        props.className = util.className(props.className, name);
      }
    ];
  };

});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],56:[function(require,module,exports){
(function (global){
// # store.memory

/*
The memory store plugin keeps the state of fields, data, and metadata. It
responds to actions and emits a change event if there are any changes.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  var compiler = plugin.require('compiler');
  var util = plugin.require('util');

  plugin.exports = function (form, emitter, options) {

    var store = {};

    store.fields = [];
    store.templateMap = {};
    store.value = {};
    store.meta = {};

    // Helper to setup fields. Field definitions need to be expanded, compiled,
    // etc.

    var setupFields = function (fields) {
      store.fields = compiler.expandFields(fields);
      store.fields = compiler.compileFields(store.fields);
      store.templateMap = compiler.templateMap(store.fields);
      store.fields = store.fields.filter(function (def) {
        return !def.template;
      });
    };

    if (options.fields) {
      setupFields(options.fields);
    }

    if (!_.isUndefined(options.value)) {
      store.value = util.copyValue(options.value);
    }

    var update = function (changing) {
      emitter.emit('change', {
        value: store.value,
        meta: store.meta,
        fields: store.fields,
        changing: changing
      });
    };

    // When fields change, we need to "inflate" them, meaning expand them and
    // run any evaluations in order to get the default value out.
    store.inflate = function () {
      var field = form.field();
      field.inflate(function (path, value) {
        store.value = util.setIn(store.value, path, value);
      });
    };

    store.metaKeys = function () {
      return Object.keys(store.meta);
    };

    store.getMeta = function (key) {
      if (store.meta[key] && store.meta[key].status === 'loaded') {
        return store.meta[key].value;
      }
      return null;
    };

    store.getMetaStatus = function (key) {
      return (store.meta[key] && store.meta[key].status) || 'unknown';
    };

    var actions = {

      setFormValue: function (value) {
        var oldValue = store.value;
        store.value = util.copyValue(value);
        store.inflate();
        update({new: value, old: oldValue, action: 'reset'});
      },

      // Set value at a path.
      setValue: function (field, value) {
        var path = field.valuePath();

        var oldValue = util.getIn(store.value, path);

        store.value = util.setIn(store.value, path, value);

        update({field: field.def, path: path, new: value, old: oldValue, action: 'set'});
      },

      // Remove a value at a path.
      removeValue: function (field, key) {
        var path = field.valuePath().concat(key);

        var oldValue = util.getIn(store.value, path);
        store.value = util.removeIn(store.value, path);

        update({field: field.def, path: path, old: oldValue, action: 'remove'});
      },

      // Stopped using this, but leaving it here for now. Was bad idea to
      // automatically erase values. But might find a better way to do this in
      // the future.
      eraseValue: function (field) {
        var path = field.valuePath();

        store.value = util.removeIn(store.value, path);

        update({field: field.def});
      },

      // Append a value to an array at a path.
      appendValue: function (field, value) {
        var path = field.valuePath();

        var oldValue = util.getIn(store.value, path);
        store.value = util.appendIn(store.value, path, value);

        update({field: field.def, path: path, new: value, old: oldValue, action: 'append'});
      },

      // Swap values of two keys.
      moveValue: function (field, fromKey, toKey) {
        var path = field.valuePath();

        var oldValue = util.getIn(store.value, path);
        store.value = util.moveIn(store.value, path, fromKey, toKey);

        update({field: field.def, path: path, new: oldValue, old: oldValue, fromKey: fromKey, toKey: toKey, action: 'move'});
      },

      // Change all the fields.
      setFields: function (fields) {
        setupFields(fields);
        store.inflate();

        update({action: 'setFields'});
      },

      // Set a metadata value for a key. Optionally set status.
      setMeta: function (key, value, status) {
        status = status || 'loaded';
        store.meta[key] = {
          value: value,
          status: status
        };
        update({action: 'setMeta'});
      }
    };

    _.extend(store, actions);

    return store;
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],57:[function(require,module,exports){
(function (global){
// # type.array

/*
Support array type where child fields are dynamically determined based on the
values of the array.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  plugin.exports.default = [];

  plugin.exports.fields = function (field) {

    if (_.isArray(field.value)) {
      return field.value.map(function (value, i) {
        var item = field.itemForValue(value);
        item.key = i;
        return field.createChild(item);
      });
    } else {
      return [];
    }
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],58:[function(require,module,exports){
// # type.boolean

/*
Support a true/false value.
*/

'use strict';

module.exports = function (plugin) {

  plugin.exports.default = false;

  plugin.exports.compile = function (def) {
    if (!def.choices) {
      def.choices = [
        {value: true, label: 'Yes'},
        {value: false, label: 'No'}
      ];
    }
  };
};

},{}],59:[function(require,module,exports){
// # type.json

/*
Arbitrary JSON value.
*/

'use strict';

module.exports = function (plugin) {

  plugin.exports.default = null;

};

},{}],60:[function(require,module,exports){
// # type.string

/*
Support string values, of course.
*/

'use strict';

module.exports = function (plugin) {

  plugin.exports.default = null;

};

},{}],61:[function(require,module,exports){
// # type.number

/*
Support number values, of course.
*/

'use strict';

module.exports = function (plugin) {

  plugin.exports.default = 0;

};

},{}],62:[function(require,module,exports){
(function (global){
// # type.object

/*
Support for object types. Object fields can supply static child fields, or if
there are additional child keys, dynamic child fields will be created much
like an array.
*/

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);

module.exports = function (plugin) {

  var util = plugin.require('util');

  plugin.exports.default = {};

  plugin.exports.fields = function (field) {

    var fields = [];
    var value = field.value;
    var unusedKeys = _.keys(value);

    if (field.def.fields) {

      fields = field.def.fields.map(function (def) {
        var child = field.createChild(def);
        if (!util.isBlank(child.def.key)) {
          unusedKeys = _.without(unusedKeys, child.def.key);
        }
        return child;
      });
    }

    if (unusedKeys.length > 0) {
      unusedKeys.forEach(function (key) {
        var item = field.itemForValue(value[key]);
        item.label = util.humanize(key);
        item.key = key;
        fields.push(field.createChild(item));
      });
    }

    return fields;
  };
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],63:[function(require,module,exports){
// # type.root

/*
Special type representing the root of the form. Gets the fields directly from
the store.
*/

'use strict';

module.exports = function (plugin) {

  plugin.exports.fields = function (field) {

    return field.form.store.fields.map(function (def) {
      return field.createChild(def);
    });

  };
};

},{}],64:[function(require,module,exports){
// # type.string

/*
Support string values, of course.
*/

'use strict';

module.exports = function (plugin) {

  plugin.exports.default = '';

};

},{}],65:[function(require,module,exports){
'use strict';

/**
 * Representation of a single EventEmitter function.
 *
 * @param {Function} fn Event handler to be called.
 * @param {Mixed} context Context for function execution.
 * @param {Boolean} once Only emit once
 * @api private
 */
function EE(fn, context, once) {
  this.fn = fn;
  this.context = context;
  this.once = once || false;
}

/**
 * Minimal EventEmitter interface that is molded against the Node.js
 * EventEmitter interface.
 *
 * @constructor
 * @api public
 */
function EventEmitter() { /* Nothing to set */ }

/**
 * Holds the assigned EventEmitters by name.
 *
 * @type {Object}
 * @private
 */
EventEmitter.prototype._events = undefined;

/**
 * Return a list of assigned event listeners.
 *
 * @param {String} event The events that should be listed.
 * @returns {Array}
 * @api public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  if (!this._events || !this._events[event]) return [];

  for (var i = 0, l = this._events[event].length, ee = []; i < l; i++) {
    ee.push(this._events[event][i].fn);
  }

  return ee;
};

/**
 * Emit an event to all registered event listeners.
 *
 * @param {String} event The name of the event.
 * @returns {Boolean} Indication if we've emitted an event.
 * @api public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  if (!this._events || !this._events[event]) return false;

  var listeners = this._events[event]
    , length = listeners.length
    , len = arguments.length
    , ee = listeners[0]
    , args
    , i, j;

  if (1 === length) {
    if (ee.once) this.removeListener(event, ee.fn, true);

    switch (len) {
      case 1: return ee.fn.call(ee.context), true;
      case 2: return ee.fn.call(ee.context, a1), true;
      case 3: return ee.fn.call(ee.context, a1, a2), true;
      case 4: return ee.fn.call(ee.context, a1, a2, a3), true;
      case 5: return ee.fn.call(ee.context, a1, a2, a3, a4), true;
      case 6: return ee.fn.call(ee.context, a1, a2, a3, a4, a5), true;
    }

    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    ee.fn.apply(ee.context, args);
  } else {
    for (i = 0; i < length; i++) {
      if (listeners[i].once) this.removeListener(event, listeners[i].fn, true);

      switch (len) {
        case 1: listeners[i].fn.call(listeners[i].context); break;
        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
        default:
          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
            args[j - 1] = arguments[j];
          }

          listeners[i].fn.apply(listeners[i].context, args);
      }
    }
  }

  return true;
};

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} event Name of the event.
 * @param {Functon} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.on = function on(event, fn, context) {
  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = [];
  this._events[event].push(new EE( fn, context || this ));

  return this;
};

/**
 * Add an EventListener that's only called once.
 *
 * @param {String} event Name of the event.
 * @param {Function} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.once = function once(event, fn, context) {
  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = [];
  this._events[event].push(new EE(fn, context || this, true ));

  return this;
};

/**
 * Remove event listeners.
 *
 * @param {String} event The event we want to remove.
 * @param {Function} fn The listener that we need to find.
 * @param {Boolean} once Only remove once listeners.
 * @api public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn, once) {
  if (!this._events || !this._events[event]) return this;

  var listeners = this._events[event]
    , events = [];

  if (fn) for (var i = 0, length = listeners.length; i < length; i++) {
    if (listeners[i].fn !== fn && listeners[i].once !== once) {
      events.push(listeners[i]);
    }
  }

  //
  // Reset the array, or remove it completely if we have no more listeners.
  //
  if (events.length) this._events[event] = events;
  else this._events[event] = null;

  return this;
};

/**
 * Remove all listeners or only the listeners for the specified event.
 *
 * @param {String} event The event want to remove all listeners for.
 * @api public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  if (!this._events) return this;

  if (event) this._events[event] = null;
  else this._events = {};

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// This function doesn't apply anymore.
//
EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
  return this;
};

//
// Expose the module.
//
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.EventEmitter2 = EventEmitter;
EventEmitter.EventEmitter3 = EventEmitter;

if ('object' === typeof module && module.exports) {
  module.exports = EventEmitter;
}

},{}],"formatic":[function(require,module,exports){
module.exports = require('./lib/formatic');

},{"./lib/formatic":47}]},{},[])("formatic")
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvY29tcGlsZXJzL2Nob2ljZXMuanMiLCJsaWIvY29tcGlsZXJzL2xvb2t1cC5qcyIsImxpYi9jb21waWxlcnMvcHJvcC1hbGlhc2VzLmpzIiwibGliL2NvbXBpbGVycy90eXBlcy5qcyIsImxpYi9jb21wb25lbnRzL2FkZC1pdGVtLmpzIiwibGliL2NvbXBvbmVudHMvY2hlY2tib3gtbGlzdC5qcyIsImxpYi9jb21wb25lbnRzL2Nob2ljZXMuanMiLCJsaWIvY29tcG9uZW50cy9maWVsZC5qcyIsImxpYi9jb21wb25lbnRzL2ZpZWxkc2V0LmpzIiwibGliL2NvbXBvbmVudHMvaGVscC5qcyIsImxpYi9jb21wb25lbnRzL2l0ZW0tY2hvaWNlcy5qcyIsImxpYi9jb21wb25lbnRzL2pzb24uanMiLCJsaWIvY29tcG9uZW50cy9sYWJlbC5qcyIsImxpYi9jb21wb25lbnRzL2xpc3QtY29udHJvbC5qcyIsImxpYi9jb21wb25lbnRzL2xpc3QtaXRlbS1jb250cm9sLmpzIiwibGliL2NvbXBvbmVudHMvbGlzdC1pdGVtLXZhbHVlLmpzIiwibGliL2NvbXBvbmVudHMvbGlzdC1pdGVtLmpzIiwibGliL2NvbXBvbmVudHMvbGlzdC5qcyIsImxpYi9jb21wb25lbnRzL21vdmUtaXRlbS1iYWNrLmpzIiwibGliL2NvbXBvbmVudHMvbW92ZS1pdGVtLWZvcndhcmQuanMiLCJsaWIvY29tcG9uZW50cy9vYmplY3QtY29udHJvbC5qcyIsImxpYi9jb21wb25lbnRzL29iamVjdC1pdGVtLWNvbnRyb2wuanMiLCJsaWIvY29tcG9uZW50cy9vYmplY3QtaXRlbS1rZXkuanMiLCJsaWIvY29tcG9uZW50cy9vYmplY3QtaXRlbS12YWx1ZS5qcyIsImxpYi9jb21wb25lbnRzL29iamVjdC1pdGVtLmpzIiwibGliL2NvbXBvbmVudHMvb2JqZWN0LmpzIiwibGliL2NvbXBvbmVudHMvcHJldHR5LXRleHRhcmVhLmpzIiwibGliL2NvbXBvbmVudHMvcmVtb3ZlLWl0ZW0uanMiLCJsaWIvY29tcG9uZW50cy9yb290LmpzIiwibGliL2NvbXBvbmVudHMvc2FtcGxlLmpzIiwibGliL2NvbXBvbmVudHMvc2VsZWN0LmpzIiwibGliL2NvbXBvbmVudHMvdGV4dC5qcyIsImxpYi9jb21wb25lbnRzL3RleHRhcmVhLmpzIiwibGliL2NvcmUvZmllbGQuanMiLCJsaWIvY29yZS9mb3JtLWluaXQuanMiLCJsaWIvY29yZS9mb3JtLmpzIiwibGliL2NvcmUvZm9ybWF0aWMuanMiLCJsaWIvZGVmYXVsdC9jb21waWxlci5qcyIsImxpYi9kZWZhdWx0L2NvbXBvbmVudC5qcyIsImxpYi9kZWZhdWx0L2NvcmUuanMiLCJsaWIvZGVmYXVsdC9ldmFsLWZ1bmN0aW9ucy5qcyIsImxpYi9kZWZhdWx0L2V2YWwuanMiLCJsaWIvZGVmYXVsdC9maWVsZC1yb3V0ZXIuanMiLCJsaWIvZGVmYXVsdC9maWVsZC1yb3V0ZXMuanMiLCJsaWIvZGVmYXVsdC9sb2FkZXIuanMiLCJsaWIvZGVmYXVsdC91dGlsLmpzIiwibGliL2Zvcm1hdGljLmpzIiwibGliL21peGlucy9jbGljay1vdXRzaWRlLmpzIiwibGliL21peGlucy9maWVsZC5qcyIsImxpYi9taXhpbnMvaW5wdXQtYWN0aW9ucy5qcyIsImxpYi9taXhpbnMvcmVzaXplLmpzIiwibGliL21peGlucy9zY3JvbGwuanMiLCJsaWIvbWl4aW5zL3VuZG8tc3RhY2suanMiLCJsaWIvcGx1Z2lucy9ib290c3RyYXAtc3R5bGUuanMiLCJsaWIvcGx1Z2lucy9kZWZhdWx0LXN0eWxlLmpzIiwibGliL3N0b3JlL21lbW9yeS5qcyIsImxpYi90eXBlcy9hcnJheS5qcyIsImxpYi90eXBlcy9ib29sZWFuLmpzIiwibGliL3R5cGVzL2pzb24uanMiLCJsaWIvdHlwZXMvbnVsbC5qcyIsImxpYi90eXBlcy9udW1iZXIuanMiLCJsaWIvdHlwZXMvb2JqZWN0LmpzIiwibGliL3R5cGVzL3Jvb3QuanMiLCJsaWIvdHlwZXMvc3RyaW5nLmpzIiwibm9kZV9tb2R1bGVzL2V2ZW50ZW1pdHRlcjMvaW5kZXguanMiLCJpbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzd0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDallBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25jQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21waWxlci5jaG9pY2VzXG5cbi8qXG5Ob3JtYWxpemVzIHRoZSBjaG9pY2VzIGZvciBhIGZpZWxkLiBTdXBwb3J0cyB0aGUgZm9sbG93aW5nIGZvcm1hdHMuXG5cbmBgYGpzXG4ncmVkLCBibHVlJ1xuXG5bJ3JlZCcsICdibHVlJ11cblxue3JlZDogJ1JlZCcsIGJsdWU6ICdCbHVlJ31cblxuW3t2YWx1ZTogJ3JlZCcsIGxhYmVsOiAnUmVkJ30sIHt2YWx1ZTogJ2JsdWUnLCBsYWJlbDogJ0JsdWUnfV1cbmBgYFxuXG5BbGwgb2YgdGhvc2UgZm9ybWF0cyBhcmUgbm9ybWFsaXplZCB0bzpcblxuYGBganNcblt7dmFsdWU6ICdyZWQnLCBsYWJlbDogJ1JlZCd9LCB7dmFsdWU6ICdibHVlJywgbGFiZWw6ICdCbHVlJ31dXG5gYGBcbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHZhciB1dGlsID0gcGx1Z2luLnJlcXVpcmUoJ3V0aWwnKTtcblxuICB2YXIgY29tcGlsZUNob2ljZXMgPSBmdW5jdGlvbiAoY2hvaWNlcykge1xuXG4gICAgLy8gQ29udmVydCBjb21tYSBzZXBhcmF0ZWQgc3RyaW5nIHRvIGFycmF5IG9mIHN0cmluZ3MuXG4gICAgaWYgKF8uaXNTdHJpbmcoY2hvaWNlcykpIHtcbiAgICAgIGNob2ljZXMgPSBjaG9pY2VzLnNwbGl0KCcsJyk7XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBvYmplY3QgdG8gYXJyYXkgb2Ygb2JqZWN0cyB3aXRoIGB2YWx1ZWAgYW5kIGBsYWJlbGAgcHJvcGVydGllcy5cbiAgICBpZiAoIV8uaXNBcnJheShjaG9pY2VzKSAmJiBfLmlzT2JqZWN0KGNob2ljZXMpKSB7XG4gICAgICBjaG9pY2VzID0gT2JqZWN0LmtleXMoY2hvaWNlcykubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2YWx1ZToga2V5LFxuICAgICAgICAgIGxhYmVsOiBjaG9pY2VzW2tleV1cbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENvcHkgdGhlIGFycmF5IG9mIGNob2ljZXMgc28gd2UgY2FuIG1hbmlwdWxhdGUgdGhlbS5cbiAgICBjaG9pY2VzID0gY2hvaWNlcy5zbGljZSgwKTtcblxuICAgIC8vIEFycmF5IG9mIGNob2ljZSBhcnJheXMgc2hvdWxkIGJlIGZsYXR0ZW5lZC5cbiAgICBjaG9pY2VzID0gXy5mbGF0dGVuKGNob2ljZXMpO1xuXG4gICAgY2hvaWNlcy5mb3JFYWNoKGZ1bmN0aW9uIChjaG9pY2UsIGkpIHtcbiAgICAgIC8vIENvbnZlcnQgYW55IHN0cmluZyBjaG9pY2VzIHRvIG9iamVjdHMgd2l0aCBgdmFsdWVgIGFuZCBgbGFiZWxgXG4gICAgICAvLyBwcm9wZXJ0aWVzLlxuICAgICAgaWYgKF8uaXNTdHJpbmcoY2hvaWNlKSkge1xuICAgICAgICBjaG9pY2VzW2ldID0ge1xuICAgICAgICAgIHZhbHVlOiBjaG9pY2UsXG4gICAgICAgICAgbGFiZWw6IHV0aWwuaHVtYW5pemUoY2hvaWNlKVxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKCFjaG9pY2VzW2ldLmxhYmVsKSB7XG4gICAgICAgIGNob2ljZXNbaV0ubGFiZWwgPSB1dGlsLmh1bWFuaXplKGNob2ljZXNbaV0udmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNob2ljZXM7XG4gIH07XG5cbiAgcGx1Z2luLmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChkZWYpIHtcbiAgICBpZiAoZGVmLmNob2ljZXMgPT09ICcnKSB7XG4gICAgICBkZWYuY2hvaWNlcyA9IFtdO1xuICAgIH0gZWxzZSBpZiAoZGVmLmNob2ljZXMpIHtcblxuICAgICAgZGVmLmNob2ljZXMgPSBjb21waWxlQ2hvaWNlcyhkZWYuY2hvaWNlcyk7XG4gICAgfVxuXG4gICAgaWYgKGRlZi5yZXBsYWNlQ2hvaWNlcyA9PT0gJycpIHtcbiAgICAgIGRlZi5yZXBsYWNlQ2hvaWNlcyA9IFtdO1xuICAgIH0gZWxzZSBpZiAoZGVmLnJlcGxhY2VDaG9pY2VzKSB7XG5cbiAgICAgIGRlZi5yZXBsYWNlQ2hvaWNlcyA9IGNvbXBpbGVDaG9pY2VzKGRlZi5yZXBsYWNlQ2hvaWNlcyk7XG5cbiAgICAgIGRlZi5yZXBsYWNlQ2hvaWNlc0xhYmVscyA9IHt9O1xuXG4gICAgICBkZWYucmVwbGFjZUNob2ljZXMuZm9yRWFjaChmdW5jdGlvbiAoY2hvaWNlKSB7XG4gICAgICAgIGRlZi5yZXBsYWNlQ2hvaWNlc0xhYmVsc1tjaG9pY2UudmFsdWVdID0gY2hvaWNlLmxhYmVsO1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gIyBjb21waWxlci5sb29rdXBcblxuLypcbkNvbnZlcnQgYSBsb29rdXAgZGVjbGFyYXRpb24gdG8gYW4gZXZhbHVhdGlvbi4gQSBsb29rdXAgcHJvcGVydHkgaXMgdXNlZCBsaWtlOlxuXG5gYGBqc1xue1xuICB0eXBlOiAnc3RyaW5nJyxcbiAga2V5OiAnc3RhdGVzJyxcbiAgbG9va3VwOiB7c291cmNlOiAnbG9jYXRpb25zJywga2V5czogWydjb3VudHJ5J119XG59XG5gYGBcblxuTG9naWNhbGx5LCB0aGUgYWJvdmUgd2lsbCB1c2UgdGhlIGBjb3VudHJ5YCBrZXkgb2YgdGhlIHZhbHVlIHRvIGFzayB0aGVcbmBsb2NhdGlvbnNgIHNvdXJjZSBmb3Igc3RhdGVzIGNob2ljZXMuIFRoaXMgd29ya3MgYnkgY29udmVydGluZyB0aGUgbG9va3VwIHRvXG50aGUgZm9sbG93aW5nIGV2YWx1YXRpb24uXG5cbmBgYGpzXG57XG4gIHR5cGU6ICdzdHJpbmcnLFxuICBrZXk6ICdzdGF0ZXMnLFxuICBjaG9pY2VzOiBbXSxcbiAgZXZhbDoge1xuICAgIG5lZWRzU291cmNlOiBbXG4gICAgICBbJ0BpZicsIFsnQGdldENhY2hlZFNvdXJjZScsICdsb2NhdGlvbnMnLCB7Y291bnRyeTogWydAZ2V0JywgJ2NvdW50cnknXX1dLCBudWxsLCBbJ2xvY2F0aW9ucycsIHtjb3VudHJ5OiBbJ0BnZXQnLCAnY291bnRyeSddfV1dXG4gICAgXSxcbiAgICBjaG9pY2VzOiBbJ0BnZXRDYWNoZWRTb3VyY2UnLCAnbG9jYXRpb25zJywge2NvdW50cnk6IFsnQGdldCcsICdjb3VudHJ5J119XVxuICB9XG59XG5gYGBcblxuVGhlIGFib3ZlIHNheXMgdG8gYWRkIGEgYG5lZWRzU291cmNlYCBwcm9wZXJ0eSBpZiBuZWNlc3NhcnkgYW5kIGFkZCBhIGBjaG9pY2VzYFxuYXJyYXkgaWYgaXQncyBhdmFpbGFibGUuIE90aGVyd2lzZSwgY2hvaWNlcyB3aWxsIGRlZmF1bHQgdG8gYW4gZW1wdHkgYXJyYXkuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHZhciBhZGRMb29rdXAgPSBmdW5jdGlvbiAoZGVmLCBsb29rdXBQcm9wTmFtZSwgY2hvaWNlc1Byb3BOYW1lKSB7XG4gICAgdmFyIGxvb2t1cCA9IGRlZltsb29rdXBQcm9wTmFtZV07XG5cbiAgICBpZiAobG9va3VwKSB7XG4gICAgICBpZiAoIWRlZltjaG9pY2VzUHJvcE5hbWVdKSB7XG4gICAgICAgIGRlZltjaG9pY2VzUHJvcE5hbWVdID0gW107XG4gICAgICB9XG4gICAgICBpZiAoIWRlZi5ldmFsKSB7XG4gICAgICAgIGRlZi5ldmFsID0ge307XG4gICAgICB9XG4gICAgICBpZiAoIWRlZi5ldmFsLm5lZWRzU291cmNlKSB7XG4gICAgICAgIGRlZi5ldmFsLm5lZWRzU291cmNlID0gW107XG4gICAgICB9XG4gICAgICBpZiAoIWRlZi5ldmFsLnJlZnJlc2hNZXRhKSB7XG4gICAgICAgIGRlZi5ldmFsLnJlZnJlc2hNZXRhID0gW107XG4gICAgICB9XG4gICAgICB2YXIga2V5cyA9IGxvb2t1cC5rZXlzIHx8IFtdO1xuICAgICAgdmFyIHBhcmFtcyA9IHt9O1xuICAgICAgdmFyIG1ldGFBcmdzLCBtZXRhR2V0LCBtZXRhSGFzRXJyb3IsIGhpZGRlblRlc3Q7XG5cbiAgICAgIGlmIChsb29rdXAuZ3JvdXApIHtcblxuICAgICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgIHBhcmFtc1trZXldID0gWydAZ2V0JywgJ2l0ZW0nLCBrZXldO1xuICAgICAgICB9KTtcbiAgICAgICAgbWV0YUFyZ3MgPSBbbG9va3VwLnNvdXJjZV0uY29uY2F0KHBhcmFtcyk7XG4gICAgICAgIG1ldGFHZXQgPSBbJ0BnZXRDYWNoZWRTb3VyY2UnXS5jb25jYXQobWV0YUFyZ3MpO1xuICAgICAgICB2YXIgbWV0YUZvckVhY2ggPSBbJ0Bmb3JFYWNoJywgJ2l0ZW0nLCBbJ0BnZXRHcm91cFZhbHVlcycsIGxvb2t1cC5ncm91cF1dO1xuICAgICAgICBkZWYuZXZhbC5uZWVkc1NvdXJjZS5wdXNoKG1ldGFGb3JFYWNoLmNvbmNhdChbXG4gICAgICAgICAgbWV0YUFyZ3MsXG4gICAgICAgICAgWydAbm90JywgbWV0YUdldF1cbiAgICAgICAgXSkpO1xuICAgICAgICBoaWRkZW5UZXN0ID0gWydAYW5kJ10uY29uY2F0KGtleXMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICByZXR1cm4gWydAZ2V0JywgJ2l0ZW0nLCBrZXldO1xuICAgICAgICB9KSk7XG4gICAgICAgIGRlZi5ldmFsW2Nob2ljZXNQcm9wTmFtZV0gPSBtZXRhRm9yRWFjaC5jb25jYXQoW1xuICAgICAgICAgIFsnQG9yJywgbWV0YUdldCwgWydAaWYnLCBoaWRkZW5UZXN0LCBbJy8vL2xvYWRpbmcvLy8nXSwgW11dXSxcbiAgICAgICAgICBbJ0BvcicsIGhpZGRlblRlc3QsIG1ldGFHZXRdXG4gICAgICAgIF0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IFsnQGdldCcsIGtleV07XG4gICAgICAgIH0pO1xuICAgICAgICBtZXRhQXJncyA9IFtsb29rdXAuc291cmNlXS5jb25jYXQocGFyYW1zKTtcbiAgICAgICAgbWV0YUdldCA9IFsnQGdldENhY2hlZFNvdXJjZSddLmNvbmNhdChtZXRhQXJncyk7XG4gICAgICAgIG1ldGFIYXNFcnJvciA9IFsnQGhhc01ldGFFcnJvciddLmNvbmNhdChtZXRhQXJncyk7XG4gICAgICAgIHZhciBtZXRhR2V0T3JMb2FkaW5nID0gWydAaWYnLCBtZXRhSGFzRXJyb3IsIFsnLy8vZXJyb3IvLy8nXSwgWydAb3InLCBtZXRhR2V0LCBbJy8vL2xvYWRpbmcvLy8nXV1dO1xuICAgICAgICBkZWYuZXZhbC5uZWVkc1NvdXJjZS5wdXNoKFsnQGlmJywgbWV0YUdldCwgbnVsbCwgbWV0YUFyZ3NdKTtcbiAgICAgICAgZGVmLmV2YWwucmVmcmVzaE1ldGEucHVzaChtZXRhQXJncyk7XG4gICAgICAgIGRlZi5ldmFsW2Nob2ljZXNQcm9wTmFtZV0gPSBtZXRhR2V0T3JMb2FkaW5nO1xuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gVGVzdCB0aGF0IHdlIGhhdmUgYWxsIG5lZWRlZCBrZXlzLlxuICAgICAgICAgIGhpZGRlblRlc3QgPSBbJ0BhbmQnXS5jb25jYXQoa2V5cy5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIFsnQGdldCcsIGtleV07XG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIC8vIFJldmVyc2UgdGVzdCBzbyB3ZSBoaWRlIGlmIGRvbid0IGhhdmUgYWxsIGtleXMuXG4gICAgICAgICAgaGlkZGVuVGVzdCA9IFsnQG5vdCcsIGhpZGRlblRlc3RdO1xuICAgICAgICAgIGlmICghZGVmLmV2YWwuaGlkZGVuKSB7XG4gICAgICAgICAgICBkZWYuZXZhbC5oaWRkZW4gPSBoaWRkZW5UZXN0O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBkZWxldGUgZGVmW2xvb2t1cFByb3BOYW1lXTtcbiAgICB9XG4gIH07XG5cbiAgcGx1Z2luLmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChkZWYpIHtcblxuICAgIGFkZExvb2t1cChkZWYsICdsb29rdXAnLCAnY2hvaWNlcycpO1xuICAgIGFkZExvb2t1cChkZWYsICdsb29rdXBSZXBsYWNlbWVudHMnLCAncmVwbGFjZUNob2ljZXMnKTtcbiAgfTtcbn07XG4iLCIvLyAjIGNvbXBpbGVycy5wcm9wLWFsaWFzZXNcblxuLypcbkFsaWFzIHNvbWUgcHJvcGVydGllcyB0byBvdGhlciBwcm9wZXJ0aWVzLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICB2YXIgcHJvcEFsaWFzZXMgPSB7XG4gICAgaGVscF90ZXh0OiAnaGVscFRleHQnXG4gIH07XG5cbiAgcGx1Z2luLmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChkZWYpIHtcbiAgICBPYmplY3Qua2V5cyhwcm9wQWxpYXNlcykuZm9yRWFjaChmdW5jdGlvbiAoYWxpYXMpIHtcbiAgICAgIHZhciBwcm9wTmFtZSA9IHByb3BBbGlhc2VzW2FsaWFzXTtcbiAgICAgIGlmICh0eXBlb2YgZGVmW3Byb3BOYW1lXSA9PT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGRlZlthbGlhc10gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlZltwcm9wTmFtZV0gPSBkZWZbYWxpYXNdO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcGlsZXJzLnR5cGVzXG5cbi8qXG5Db252ZXJ0IHNvbWUgaGlnaC1sZXZlbCB0eXBlcyB0byBsb3ctbGV2ZWwgdHlwZXMgYW5kIHByb3BlcnRpZXMuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICAvLyBNYXAgaGlnaC1sZXZlbCB0eXBlIHRvIGxvdy1sZXZlbCB0eXBlLiBJZiBhIGZ1bmN0aW9uIGlzIHN1cHBsaWVkLCBjYW5cbiAgLy8gbW9kaWZ5IHRoZSBmaWVsZCBkZWZpbml0aW9uLlxuICB2YXIgdHlwZUNvZXJjZSA9IHtcbiAgICB1bmljb2RlOiBmdW5jdGlvbiAoZGVmKSB7XG4gICAgICBkZWYudHlwZSA9ICdzdHJpbmcnO1xuICAgICAgZGVmLm1heFJvd3MgPSAxO1xuICAgIH0sXG4gICAgdGV4dDogJ3N0cmluZycsXG4gICAgc2VsZWN0OiBmdW5jdGlvbiAoZGVmKSB7XG4gICAgICBkZWYuY2hvaWNlcyA9IGRlZi5jaG9pY2VzIHx8IFtdO1xuICAgIH0sXG4gICAgYm9vbDogJ2Jvb2xlYW4nLFxuICAgIGRpY3Q6ICdvYmplY3QnLFxuICAgIGRlY2ltYWw6ICdudW1iZXInLFxuICAgIGludDogJ251bWJlcicsXG4gICAgZmllbGRzZXQ6IGZ1bmN0aW9uIChkZWYpIHtcbiAgICAgIGRlZi50eXBlID0gJ29iamVjdCc7XG4gICAgICBkZWYuc3RhdGljS2V5cyA9IHRydWU7XG4gICAgfVxuICB9O1xuXG4gIHR5cGVDb2VyY2Uuc3RyID0gdHlwZUNvZXJjZS51bmljb2RlO1xuXG5cbiAgcGx1Z2luLmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChkZWYpIHtcblxuICAgIHZhciBjb2VyY2VUeXBlID0gdHlwZUNvZXJjZVtkZWYudHlwZV07XG4gICAgaWYgKGNvZXJjZVR5cGUpIHtcbiAgICAgIGlmIChfLmlzU3RyaW5nKGNvZXJjZVR5cGUpKSB7XG4gICAgICAgIGRlZi50eXBlID0gY29lcmNlVHlwZTtcbiAgICAgIH0gZWxzZSBpZiAoXy5pc0Z1bmN0aW9uKGNvZXJjZVR5cGUpKSB7XG4gICAgICAgIGRlZiA9IGNvZXJjZVR5cGUoZGVmKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5hZGQtaXRlbVxuXG4vKlxuVGhlIGFkZCBidXR0b24gdG8gYXBwZW5kIGFuIGl0ZW0gdG8gYSBmaWVsZC5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWUsXG4gICAgICAgIGxhYmVsOiBwbHVnaW4uY29uZmlnVmFsdWUoJ2xhYmVsJywgJ1thZGRdJylcbiAgICAgIH07XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFIuc3Bhbih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZSwgb25DbGljazogdGhpcy5wcm9wcy5vbkNsaWNrfSwgdGhpcy5wcm9wcy5sYWJlbCk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50LmNoZWNrYm94LWxpc3RcblxuLypcblVzZWQgd2l0aCBhcnJheSB2YWx1ZXMgdG8gc3VwcGx5IG11bHRpcGxlIGNoZWNrYm94ZXMgZm9yIGFkZGluZyBtdWx0aXBsZVxuZW51bWVyYXRlZCB2YWx1ZXMgdG8gYW4gYXJyYXkuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xudmFyIFIgPSBSZWFjdC5ET007XG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBtaXhpbnM6IFtwbHVnaW4ucmVxdWlyZSgnbWl4aW4uZmllbGQnKV0sXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIG9uQ2hhbmdlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBHZXQgYWxsIHRoZSBjaGVja2VkIGNoZWNrYm94ZXMgYW5kIGNvbnZlcnQgdG8gYW4gYXJyYXkgb2YgdmFsdWVzLlxuICAgICAgdmFyIGNob2ljZU5vZGVzID0gdGhpcy5yZWZzLmNob2ljZXMuZ2V0RE9NTm9kZSgpLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdpbnB1dCcpO1xuICAgICAgY2hvaWNlTm9kZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChjaG9pY2VOb2RlcywgMCk7XG4gICAgICB2YXIgdmFsdWVzID0gY2hvaWNlTm9kZXMubWFwKGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgIHJldHVybiBub2RlLmNoZWNrZWQgPyBub2RlLnZhbHVlIDogbnVsbDtcbiAgICAgIH0pLmZpbHRlcihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfSk7XG4gICAgICB0aGlzLnByb3BzLmZpZWxkLnZhbCh2YWx1ZXMpO1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgdmFyIGNob2ljZXMgPSBmaWVsZC5kZWYuY2hvaWNlcyB8fCBbXTtcblxuICAgICAgdmFyIGlzSW5saW5lID0gIV8uZmluZChjaG9pY2VzLCBmdW5jdGlvbiAoY2hvaWNlKSB7XG4gICAgICAgIHJldHVybiBjaG9pY2Uuc2FtcGxlO1xuICAgICAgfSk7XG5cbiAgICAgIHZhciB2YWx1ZSA9IGZpZWxkLnZhbHVlIHx8IFtdO1xuXG4gICAgICByZXR1cm4gcGx1Z2luLmNvbXBvbmVudCgnZmllbGQnKSh7XG4gICAgICAgIGZpZWxkOiBmaWVsZFxuICAgICAgfSxcbiAgICAgICAgUi5kaXYoe2NsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWUsIHJlZjogJ2Nob2ljZXMnfSxcbiAgICAgICAgICBjaG9pY2VzLm1hcChmdW5jdGlvbiAoY2hvaWNlLCBpKSB7XG5cbiAgICAgICAgICAgIHZhciBpbnB1dEZpZWxkID0gUi5zcGFuKHtzdHlsZToge3doaXRlU3BhY2U6ICdub3dyYXAnfX0sXG4gICAgICAgICAgICAgIFIuaW5wdXQoe1xuICAgICAgICAgICAgICAgIG5hbWU6IGZpZWxkLmRlZi5rZXksXG4gICAgICAgICAgICAgICAgdHlwZTogJ2NoZWNrYm94JyxcbiAgICAgICAgICAgICAgICB2YWx1ZTogY2hvaWNlLnZhbHVlLFxuICAgICAgICAgICAgICAgIGNoZWNrZWQ6IHZhbHVlLmluZGV4T2YoY2hvaWNlLnZhbHVlKSA+PSAwID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlOiB0aGlzLm9uQ2hhbmdlXG4gICAgICAgICAgICAgICAgLy9vbkZvY3VzOiB0aGlzLnByb3BzLmFjdGlvbnMuZm9jdXNcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICcgJyxcbiAgICAgICAgICAgICAgUi5zcGFuKHtjbGFzc05hbWU6ICdmaWVsZC1jaG9pY2UtbGFiZWwnfSxcbiAgICAgICAgICAgICAgICBjaG9pY2UubGFiZWxcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGlzSW5saW5lKSB7XG4gICAgICAgICAgICAgIHJldHVybiBSLnNwYW4oe2tleTogaSwgY2xhc3NOYW1lOiAnZmllbGQtY2hvaWNlJ30sXG4gICAgICAgICAgICAgICAgaW5wdXRGaWVsZCwgJyAnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gUi5kaXYoe2tleTogaSwgY2xhc3NOYW1lOiAnZmllbGQtY2hvaWNlJ30sXG4gICAgICAgICAgICAgICAgaW5wdXRGaWVsZCwgJyAnLFxuICAgICAgICAgICAgICAgIHBsdWdpbi5jb21wb25lbnQoJ3NhbXBsZScpKHtmaWVsZDogZmllbGQsIGNob2ljZTogY2hvaWNlfSlcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG52YXIgQ1NTVHJhbnNpdGlvbkdyb3VwID0gUmVhY3QuY3JlYXRlRmFjdG9yeShSZWFjdC5hZGRvbnMuQ1NTVHJhbnNpdGlvbkdyb3VwKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBtaXhpbnM6IFtcbiAgICAgIC8vcGx1Z2luLnJlcXVpcmUoJ21peGluLnJlc2l6ZScpLFxuICAgICAgLy9wbHVnaW4ucmVxdWlyZSgnbWl4aW4uc2Nyb2xsJyksXG4gICAgICBwbHVnaW4ucmVxdWlyZSgnbWl4aW4uY2xpY2stb3V0c2lkZScpXG4gICAgXSxcblxuICAgIGdldEluaXRpYWxTdGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbWF4SGVpZ2h0OiBudWxsLFxuICAgICAgICBvcGVuOiB0aGlzLnByb3BzLm9wZW5cbiAgICAgIH07XG4gICAgfSxcbiAgICAvL1xuICAgIC8vIG9uVG9nZ2xlOiBmdW5jdGlvbiAoKSB7XG4gICAgLy8gICB0aGlzLnNldFN0YXRlKHtvcGVuOiAhdGhpcy5zdGF0ZS5vcGVufSk7XG4gICAgLy8gfSxcbiAgICAvL1xuICAgIC8vIG9uQ2xvc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyAgIHRoaXMuc2V0U3RhdGUoe29wZW46IGZhbHNlfSk7XG4gICAgLy8gfSxcbiAgICAvL1xuICAgIC8vIGZpeENob2ljZXNXaWR0aDogZnVuY3Rpb24gKCkge1xuICAgIC8vICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgLy8gICAgIGNob2ljZXNXaWR0aDogdGhpcy5yZWZzLmFjdGl2ZS5nZXRET01Ob2RlKCkub2Zmc2V0V2lkdGhcbiAgICAvLyAgIH0pO1xuICAgIC8vIH0sXG4gICAgLy9cbiAgICAvLyBvblJlc2l6ZVdpbmRvdzogZnVuY3Rpb24gKCkge1xuICAgIC8vICAgdGhpcy5maXhDaG9pY2VzV2lkdGgoKTtcbiAgICAvLyB9LFxuXG4gICAgLy8gY29tcG9uZW50RGlkTW91bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyAgIHRoaXMuZml4Q2hvaWNlc1dpZHRoKCk7XG4gICAgLy8gICB0aGlzLnNldE9uQ2xpY2tPdXRzaWRlKCdzZWxlY3QnLCB0aGlzLm9uQ2xvc2UpO1xuICAgIC8vIH0sXG5cbiAgICBnZXRJZ25vcmVDbG9zZU5vZGVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoIXRoaXMucHJvcHMuaWdub3JlQ2xvc2VOb2Rlcykge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICB2YXIgbm9kZXMgPSB0aGlzLnByb3BzLmlnbm9yZUNsb3NlTm9kZXMoKTtcbiAgICAgIGlmICghXy5pc0FycmF5KG5vZGVzKSkge1xuICAgICAgICBub2RlcyA9IFtub2Rlc107XG4gICAgICB9XG4gICAgICByZXR1cm4gbm9kZXM7XG4gICAgfSxcblxuICAgIGNvbXBvbmVudERpZE1vdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnNldE9uQ2xpY2tPdXRzaWRlKCdjaG9pY2VzJywgZnVuY3Rpb24gKGV2ZW50KSB7XG5cbiAgICAgICAgLy8gTWFrZSBzdXJlIHdlIGRvbid0IGZpbmQgYW55IG5vZGVzIHRvIGlnbm9yZS5cbiAgICAgICAgaWYgKCFfLmZpbmQodGhpcy5nZXRJZ25vcmVDbG9zZU5vZGVzKCksIGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaXNOb2RlSW5zaWRlKGV2ZW50LnRhcmdldCwgbm9kZSk7XG4gICAgICAgIH0uYmluZCh0aGlzKSkpIHtcbiAgICAgICAgICB0aGlzLnByb3BzLm9uQ2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICAgdGhpcy5hZGp1c3RTaXplKCk7XG4gICAgfSxcblxuICAgIG9uU2VsZWN0OiBmdW5jdGlvbiAoY2hvaWNlKSB7XG4gICAgICB0aGlzLnByb3BzLm9uU2VsZWN0KGNob2ljZS52YWx1ZSk7XG4gICAgfSxcblxuICAgIG9uUmVzaXplV2luZG93OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmFkanVzdFNpemUoKTtcbiAgICB9LFxuXG4gICAgb25TY3JvbGxXaW5kb3c6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuYWRqdXN0U2l6ZSgpO1xuICAgIH0sXG5cbiAgICBhZGp1c3RTaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAodGhpcy5yZWZzLmNob2ljZXMpIHtcbiAgICAgICAgdmFyIG5vZGUgPSB0aGlzLnJlZnMuY2hvaWNlcy5nZXRET01Ob2RlKCk7XG4gICAgICAgIHZhciByZWN0ID0gbm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgdmFyIHRvcCA9IHJlY3QudG9wO1xuICAgICAgICB2YXIgd2luZG93SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xuICAgICAgICB2YXIgaGVpZ2h0ID0gd2luZG93SGVpZ2h0IC0gdG9wO1xuICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICBtYXhIZWlnaHQ6IGhlaWdodFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgY29tcG9uZW50V2lsbFJlY2VpdmVQcm9wczogZnVuY3Rpb24gKG5leHRQcm9wcykge1xuICAgICAgdGhpcy5zZXRTdGF0ZSh7b3BlbjogbmV4dFByb3BzLm9wZW59LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuYWRqdXN0U2l6ZSgpO1xuICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICB9LFxuXG4gICAgb25TY3JvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdzdG9wIHRoYXQhJylcbiAgICAgIC8vIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAvLyBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICB9LFxuXG4gICAgb25XaGVlbDogZnVuY3Rpb24gKCkge1xuICAgICAgLy8gZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIC8vIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgdmFyIGNob2ljZXMgPSB0aGlzLnByb3BzLmNob2ljZXM7XG5cbiAgICAgIGlmIChjaG9pY2VzICYmIGNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGNob2ljZXMgPSBbe3ZhbHVlOiAnLy8vZW1wdHkvLy8nfV07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBSLmRpdih7cmVmOiAnY29udGFpbmVyJywgb25XaGVlbDogdGhpcy5vbldoZWVsLCBvblNjcm9sbDogdGhpcy5vblNjcm9sbCwgY2xhc3NOYW1lOiAnY2hvaWNlcy1jb250YWluZXInLCBzdHlsZToge1xuICAgICAgICB1c2VyU2VsZWN0OiAnbm9uZScsIFdlYmtpdFVzZXJTZWxlY3Q6ICdub25lJywgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4gICAgICAgIG1heEhlaWdodDogdGhpcy5zdGF0ZS5tYXhIZWlnaHQgPyB0aGlzLnN0YXRlLm1heEhlaWdodCA6IG51bGxcbiAgICAgIH19LFxuICAgICAgICBDU1NUcmFuc2l0aW9uR3JvdXAoe3RyYW5zaXRpb25OYW1lOiAncmV2ZWFsJ30sXG4gICAgICAgICAgdGhpcy5wcm9wcy5vcGVuID8gUi51bCh7cmVmOiAnY2hvaWNlcycsIGNsYXNzTmFtZTogJ2Nob2ljZXMnfSxcbiAgICAgICAgICAgIGNob2ljZXMubWFwKGZ1bmN0aW9uIChjaG9pY2UsIGkpIHtcblxuICAgICAgICAgICAgICB2YXIgY2hvaWNlRWxlbWVudCA9IG51bGw7XG5cbiAgICAgICAgICAgICAgaWYgKGNob2ljZS52YWx1ZSA9PT0gJy8vL2xvYWRpbmcvLy8nKSB7XG4gICAgICAgICAgICAgICAgY2hvaWNlRWxlbWVudCA9IFIuYSh7aHJlZjogJ0phdmFTY3JpcHQnICsgJzonLCBvbkNsaWNrOiB0aGlzLnByb3BzLm9uQ2xvc2V9LFxuICAgICAgICAgICAgICAgICAgUi5zcGFuKHtjbGFzc05hbWU6ICdjaG9pY2UtbGFiZWwnfSxcbiAgICAgICAgICAgICAgICAgICAgJ0xvYWRpbmcuLi4nXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjaG9pY2UudmFsdWUgPT09ICcvLy9lbXB0eS8vLycpIHtcbiAgICAgICAgICAgICAgICBjaG9pY2VFbGVtZW50ID0gUi5hKHtocmVmOiAnSmF2YVNjcmlwdCcgKyAnOicsIG9uQ2xpY2s6IHRoaXMucHJvcHMub25DbG9zZX0sXG4gICAgICAgICAgICAgICAgICBSLnNwYW4oe2NsYXNzTmFtZTogJ2Nob2ljZS1sYWJlbCd9LFxuICAgICAgICAgICAgICAgICAgICAnTm8gY2hvaWNlcyBhdmFpbGFibGUuJ1xuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2hvaWNlRWxlbWVudCA9IFIuYSh7aHJlZjogJ0phdmFTY3JpcHQnICsgJzonLCBvbkNsaWNrOiB0aGlzLm9uU2VsZWN0LmJpbmQodGhpcywgY2hvaWNlKX0sXG4gICAgICAgICAgICAgICAgICBSLnNwYW4oe2NsYXNzTmFtZTogJ2Nob2ljZS1sYWJlbCd9LFxuICAgICAgICAgICAgICAgICAgICBjaG9pY2UubGFiZWxcbiAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICBSLnNwYW4oe2NsYXNzTmFtZTogJ2Nob2ljZS1zYW1wbGUnfSxcbiAgICAgICAgICAgICAgICAgICAgY2hvaWNlLnNhbXBsZVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gUi5saSh7a2V5OiBpLCBjbGFzc05hbWU6ICdjaG9pY2UnfSxcbiAgICAgICAgICAgICAgICBjaG9pY2VFbGVtZW50XG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgICAgKSA6IG51bGxcbiAgICAgICAgKVxuICAgICAgKTtcblxuXG4gICAgICAvLyB2YXIgY2xhc3NOYW1lID0gZm9ybWF0aWMuY2xhc3NOYW1lKCdkcm9wZG93bi1maWVsZCcsIHBsdWdpbi5jb25maWcuY2xhc3NOYW1lLCB0aGlzLnByb3BzLmZpZWxkLmNsYXNzTmFtZSk7XG4gICAgICAvL1xuICAgICAgLy8gdmFyIHNlbGVjdGVkTGFiZWwgPSAnJztcbiAgICAgIC8vIHZhciBtYXRjaGluZ0xhYmVscyA9IHRoaXMucHJvcHMuZmllbGQuY2hvaWNlcy5maWx0ZXIoZnVuY3Rpb24gKGNob2ljZSkge1xuICAgICAgLy8gICByZXR1cm4gY2hvaWNlLnZhbHVlID09PSB0aGlzLnByb3BzLmZpZWxkLnZhbHVlO1xuICAgICAgLy8gfS5iaW5kKHRoaXMpKTtcbiAgICAgIC8vIGlmIChtYXRjaGluZ0xhYmVscy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyAgIHNlbGVjdGVkTGFiZWwgPSBtYXRjaGluZ0xhYmVsc1swXS5sYWJlbDtcbiAgICAgIC8vIH1cbiAgICAgIC8vIHNlbGVjdGVkTGFiZWwgPSBzZWxlY3RlZExhYmVsIHx8ICdcXHUwMGEwJztcbiAgICAgIC8vXG4gICAgICAvLyByZXR1cm4gUi5kaXYoXy5leHRlbmQoe2NsYXNzTmFtZTogY2xhc3NOYW1lLCByZWY6ICdzZWxlY3QnfSwgcGx1Z2luLmNvbmZpZy5hdHRyaWJ1dGVzKSxcbiAgICAgIC8vICAgUi5kaXYoe2NsYXNzTmFtZTogJ2ZpZWxkLXZhbHVlJywgcmVmOiAnYWN0aXZlJywgb25DbGljazogdGhpcy5vblRvZ2dsZX0sIHNlbGVjdGVkTGFiZWwpLFxuICAgICAgLy8gICBSLmRpdih7Y2xhc3NOYW1lOiAnZmllbGQtdG9nZ2xlICcgKyAodGhpcy5zdGF0ZS5vcGVuID8gJ2ZpZWxkLW9wZW4nIDogJ2ZpZWxkLWNsb3NlZCcpLCBvbkNsaWNrOiB0aGlzLm9uVG9nZ2xlfSksXG4gICAgICAvLyAgIFJlYWN0LmFkZG9ucy5DU1NUcmFuc2l0aW9uR3JvdXAoe3RyYW5zaXRpb25OYW1lOiAncmV2ZWFsJ30sXG4gICAgICAvLyAgICAgUi5kaXYoe2NsYXNzTmFtZTogJ2ZpZWxkLWNob2ljZXMtY29udGFpbmVyJ30sXG4gICAgICAvLyAgICAgICB0aGlzLnN0YXRlLm9wZW4gPyBSLnVsKHtyZWY6ICdjaG9pY2VzJywgY2xhc3NOYW1lOiAnZmllbGQtY2hvaWNlcycsIHN0eWxlOiB7d2lkdGg6IHRoaXMuc3RhdGUuY2hvaWNlc1dpZHRofX0sXG4gICAgICAvLyAgICAgICAgIHRoaXMucHJvcHMuZmllbGQuY2hvaWNlcy5tYXAoZnVuY3Rpb24gKGNob2ljZSkge1xuICAgICAgLy8gICAgICAgICAgIHJldHVybiBSLmxpKHtcbiAgICAgIC8vICAgICAgICAgICAgIGNsYXNzTmFtZTogJ2ZpZWxkLWNob2ljZScsXG4gICAgICAvLyAgICAgICAgICAgICBvbkNsaWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoe29wZW46IGZhbHNlfSk7XG4gICAgICAvLyAgICAgICAgICAgICAgIHRoaXMucHJvcHMuZm9ybS5hY3Rpb25zLmNoYW5nZSh0aGlzLnByb3BzLmZpZWxkLCBjaG9pY2UudmFsdWUpO1xuICAgICAgLy8gICAgICAgICAgICAgfS5iaW5kKHRoaXMpXG4gICAgICAvLyAgICAgICAgICAgfSwgY2hvaWNlLmxhYmVsKTtcbiAgICAgIC8vICAgICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgLy8gICAgICAgKSA6IFtdXG4gICAgICAvLyAgICAgKVxuICAgICAgLy8gICApXG4gICAgICAvLyApO1xuICAgIH1cbiAgfSk7XG59O1xuXG5cbi8vIGNvbXBvbmVudERpZE1vdW50OiBmdW5jdGlvbiAoKSB7XG4vLyAgIHRoaXMuc2V0T25DbGlja091dHNpZGUoJ2Nob2ljZXMnLCBmdW5jdGlvbiAoZXZlbnQpIHtcbi8vXG4vLyAgICAgLy8gTWFrZSBzdXJlIHdlIGRvbid0IGZpbmQgYW55IG5vZGVzIHRvIGlnbm9yZS5cbi8vICAgICBpZiAoIV8uZmluZCh0aGlzLmdldElnbm9yZUNsb3NlTm9kZXMoKSwgZnVuY3Rpb24gKG5vZGUpIHtcbi8vICAgICAgIGNvbnNvbGUubG9nKG5vZGUsIGV2ZW50LnRhcmdldClcbi8vICAgICAgIHJldHVybiAhdGhpcy5pc05vZGVPdXRzaWRlKG5vZGUsIGV2ZW50LnRhcmdldCk7XG4vLyAgICAgfS5iaW5kKHRoaXMpKSkge1xuLy8gICAgICAgY29uc29sZS5sb2coXCJob3c/Pz9cIilcbi8vICAgICAgIHRoaXMucHJvcHMub25DbG9zZSgpO1xuLy8gICAgIH1cbi8vICAgfS5iaW5kKHRoaXMpKTtcbi8vIH0sXG4vL1xuLy8gb25TZWxlY3Q6IGZ1bmN0aW9uIChjaG9pY2UpIHtcbi8vICAgdGhpcy5wcm9wcy5vblNlbGVjdChjaG9pY2UudmFsdWUpO1xuLy8gfSxcbi8vXG4vLyByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbi8vXG4vLyAgIHJldHVybiBSLmRpdih7cmVmOiAnY29udGFpbmVyJywgY2xhc3NOYW1lOiAnY2hvaWNlcy1jb250YWluZXInLCBzdHlsZToge3VzZXJTZWxlY3Q6ICdub25lJywgV2Via2l0VXNlclNlbGVjdDogJ25vbmUnLCBwb3NpdGlvbjogJ2Fic29sdXRlJ319LFxuLy8gICAgIHRoaXMucHJvcHMub3BlbiA/XG4vLyAgICAgICBDU1NUcmFuc2l0aW9uR3JvdXAoe3RyYW5zaXRpb25OYW1lOiAncmV2ZWFsJ30sXG4vLyAgICAgICAgIFIudWwoe3JlZjogJ2Nob2ljZXMnLCBjbGFzc05hbWU6ICdjaG9pY2VzJ30sXG4vLyAgICAgICAgICAgdGhpcy5wcm9wcy5jaG9pY2VzLm1hcChmdW5jdGlvbiAoY2hvaWNlLCBpKSB7XG4vLyAgICAgICAgICAgICByZXR1cm4gUi5saSh7a2V5OiBpLCBjbGFzc05hbWU6ICdjaG9pY2UnfSxcbi8vICAgICAgICAgICAgICAgUi5hKHtocmVmOiAnSmF2YVNjcmlwdDonICsgJycsIG9uQ2xpY2s6IHRoaXMub25TZWxlY3QuYmluZCh0aGlzLCBjaG9pY2UpfSxcbi8vICAgICAgICAgICAgICAgICBSLnNwYW4oe2NsYXNzTmFtZTogJ2Nob2ljZS1sYWJlbCd9LFxuLy8gICAgICAgICAgICAgICAgICAgY2hvaWNlLmxhYmVsXG4vLyAgICAgICAgICAgICAgICAgKSxcbi8vICAgICAgICAgICAgICAgICBSLnNwYW4oe2NsYXNzTmFtZTogJ2Nob2ljZS1zYW1wbGUnfSxcbi8vICAgICAgICAgICAgICAgICAgIGNob2ljZS5zYW1wbGVcbi8vICAgICAgICAgICAgICAgICApXG4vLyAgICAgICAgICAgICAgIClcbi8vICAgICAgICAgICAgICk7XG4vLyAgICAgICAgICAgfS5iaW5kKHRoaXMpKVxuLy8gICAgICAgICApXG4vLyAgICAgICApXG4vLyAgICAgICA6IG51bGxcbi8vICAgKTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQuZmllbGRcblxuLypcblVzZWQgYnkgYW55IGZpZWxkcyB0byBwdXQgdGhlIGxhYmVsIGFuZCBoZWxwIHRleHQgYXJvdW5kIHRoZSBmaWVsZC5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG52YXIgQ1NTVHJhbnNpdGlvbkdyb3VwID0gUmVhY3QuY3JlYXRlRmFjdG9yeShSZWFjdC5hZGRvbnMuQ1NTVHJhbnNpdGlvbkdyb3VwKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGdldEluaXRpYWxTdGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29sbGFwc2VkOiB0aGlzLnByb3BzLmZpZWxkLmRlZi5jb2xsYXBzZWQgPyB0cnVlIDogZmFsc2VcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGlzQ29sbGFwc2libGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHJldHVybiAhXy5pc1VuZGVmaW5lZChmaWVsZC5kZWYuY29sbGFwc2VkKSB8fCAhXy5pc1VuZGVmaW5lZChmaWVsZC5kZWYuY29sbGFwc2libGUpO1xuICAgIH0sXG5cbiAgICBvbkNsaWNrTGFiZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICBjb2xsYXBzZWQ6ICF0aGlzLnN0YXRlLmNvbGxhcHNlZFxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuXG4gICAgICBpZiAodGhpcy5wcm9wcy5wbGFpbikge1xuICAgICAgICByZXR1cm4gdGhpcy5wcm9wcy5jaGlsZHJlbjtcbiAgICAgIH1cblxuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgdmFyIGluZGV4ID0gdGhpcy5wcm9wcy5pbmRleDtcbiAgICAgIGlmICghXy5pc051bWJlcihpbmRleCkpIHtcbiAgICAgICAgaW5kZXggPSBfLmlzTnVtYmVyKGZpZWxkLmRlZi5rZXkpID8gZmllbGQuZGVmLmtleSA6IHVuZGVmaW5lZDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFIuZGl2KHtjbGFzc05hbWU6IHRoaXMucHJvcHMuY2xhc3NOYW1lLCBzdHlsZToge2Rpc3BsYXk6IChmaWVsZC5oaWRkZW4oKSA/ICdub25lJyA6ICcnKX19LFxuICAgICAgICBwbHVnaW4uY29tcG9uZW50KCdsYWJlbCcpKHtmaWVsZDogZmllbGQsIGluZGV4OiBpbmRleCwgb25DbGljazogdGhpcy5pc0NvbGxhcHNpYmxlKCkgPyB0aGlzLm9uQ2xpY2tMYWJlbCA6IG51bGx9KSxcbiAgICAgICAgQ1NTVHJhbnNpdGlvbkdyb3VwKHt0cmFuc2l0aW9uTmFtZTogJ3JldmVhbCd9LFxuICAgICAgICAgIHRoaXMuc3RhdGUuY29sbGFwc2VkID8gW10gOiBbXG4gICAgICAgICAgICBwbHVnaW4uY29tcG9uZW50KCdoZWxwJykoe2tleTogJ2hlbHAnLCBmaWVsZDogZmllbGR9KSxcbiAgICAgICAgICAgIHRoaXMucHJvcHMuY2hpbGRyZW5cbiAgICAgICAgICBdXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50LmZpZWxkc2V0XG5cbi8qXG5SZW5kZXIgbXVsdGlwbGUgY2hpbGQgZmllbGRzIGZvciBhIGZpZWxkLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIG1peGluczogW3BsdWdpbi5yZXF1aXJlKCdtaXhpbi5maWVsZCcpXSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZmllbGQgPSB0aGlzLnByb3BzLmZpZWxkO1xuXG4gICAgICByZXR1cm4gcGx1Z2luLmNvbXBvbmVudCgnZmllbGQnKSh7XG4gICAgICAgIGZpZWxkOiBmaWVsZCwgcGxhaW46IHRoaXMucHJvcHMucGxhaW5cbiAgICAgIH0sXG4gICAgICAgIFIuZmllbGRzZXQoe2NsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWV9LFxuICAgICAgICAgIGZpZWxkLmZpZWxkcygpLm1hcChmdW5jdGlvbiAoZmllbGQsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZC5jb21wb25lbnQoe2tleTogZmllbGQuZGVmLmtleSB8fCBpLCBvbkZvY3VzOiB0aGlzLnByb3BzLm9uRm9jdXMsIG9uQmx1cjogdGhpcy5wcm9wcy5vbkJsdXJ9KTtcbiAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50LmhlbHBcblxuLypcbkp1c3QgdGhlIGhlbHAgdGV4dCBibG9jay5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuXG4gICAgICB2YXIgZmllbGQgPSB0aGlzLnByb3BzLmZpZWxkO1xuXG4gICAgICByZXR1cm4gZmllbGQuZGVmLmhlbHBUZXh0ID9cbiAgICAgICAgUi5kaXYoe2NsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWV9LFxuICAgICAgICAgIGZpZWxkLmRlZi5oZWxwVGV4dFxuICAgICAgICApIDpcbiAgICAgICAgUi5zcGFuKG51bGwpO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5pdGVtLWNob2ljZXNcblxuLypcbkdpdmUgYSBsaXN0IG9mIGNob2ljZXMgb2YgaXRlbSB0eXBlcyB0byBjcmVhdGUgYXMgY2hpbGRyZW4gb2YgYW4gZmllbGQuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xudmFyIFIgPSBSZWFjdC5ET007XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgZ2V0RGVmYXVsdFByb3BzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWU6IHBsdWdpbi5jb25maWcuY2xhc3NOYW1lXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICBvbkNoYW5nZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICB0aGlzLnByb3BzLm9uU2VsZWN0KHBhcnNlSW50KGV2ZW50LnRhcmdldC52YWx1ZSkpO1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgdmFyIHR5cGVDaG9pY2VzID0gbnVsbDtcbiAgICAgIGlmIChmaWVsZC5pdGVtcygpLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdHlwZUNob2ljZXMgPSBSLnNlbGVjdCh7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZSwgdmFsdWU6IHRoaXMudmFsdWUsIG9uQ2hhbmdlOiB0aGlzLm9uQ2hhbmdlfSxcbiAgICAgICAgICBmaWVsZC5pdGVtcygpLm1hcChmdW5jdGlvbiAoaXRlbSwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIFIub3B0aW9uKHtrZXk6IGksIHZhbHVlOiBpfSwgaXRlbS5sYWJlbCB8fCBpKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHlwZUNob2ljZXMgPyB0eXBlQ2hvaWNlcyA6IFIuc3BhbihudWxsKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQuanNvblxuXG4vKlxuVGV4dGFyZWEgZWRpdG9yIGZvciBKU09OLiBXaWxsIHZhbGlkYXRlIHRoZSBKU09OIGJlZm9yZSBzZXR0aW5nIHRoZSB2YWx1ZSwgc29cbndoaWxlIHRoZSB2YWx1ZSBpcyBpbnZhbGlkLCBubyBleHRlcm5hbCBzdGF0ZSBjaGFuZ2VzIHdpbGwgb2NjdXIuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xudmFyIFIgPSBSZWFjdC5ET007XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgbWl4aW5zOiBbcGx1Z2luLnJlcXVpcmUoJ21peGluLmZpZWxkJyldLFxuXG4gICAgZ2V0RGVmYXVsdFByb3BzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWU6IHBsdWdpbi5jb25maWcuY2xhc3NOYW1lLFxuICAgICAgICByb3dzOiBwbHVnaW4uY29uZmlnLnJvd3MgfHwgNVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgaXNWYWxpZFZhbHVlOiBmdW5jdGlvbiAodmFsdWUpIHtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgSlNPTi5wYXJzZSh2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGdldEluaXRpYWxTdGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaXNWYWxpZDogdHJ1ZSxcbiAgICAgICAgdmFsdWU6IEpTT04uc3RyaW5naWZ5KHRoaXMucHJvcHMuZmllbGQudmFsdWUsIG51bGwsIDIpXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICBvbkNoYW5nZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICB2YXIgaXNWYWxpZCA9IHRoaXMuaXNWYWxpZFZhbHVlKGV2ZW50LnRhcmdldC52YWx1ZSk7XG5cbiAgICAgIGlmIChpc1ZhbGlkKSB7XG4gICAgICAgIC8vIE5lZWQgdG8gaGFuZGxlIHRoaXMgYmV0dGVyLiBOZWVkIHRvIHRyYWNrIHBvc2l0aW9uLlxuICAgICAgICB0aGlzLl9pc0NoYW5naW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wcm9wcy5maWVsZC52YWwoSlNPTi5wYXJzZShldmVudC50YXJnZXQudmFsdWUpKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgIGlzVmFsaWQ6IGlzVmFsaWQsXG4gICAgICAgIHZhbHVlOiBldmVudC50YXJnZXQudmFsdWVcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBjb21wb25lbnRXaWxsUmVjZWl2ZVByb3BzOiBmdW5jdGlvbiAobmV4dFByb3BzKSB7XG4gICAgICBpZiAoIXRoaXMuX2lzQ2hhbmdpbmcpIHtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgaXNWYWxpZDogdHJ1ZSxcbiAgICAgICAgICB2YWx1ZTogSlNPTi5zdHJpbmdpZnkobmV4dFByb3BzLmZpZWxkLnZhbHVlLCBudWxsLCAyKVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2lzQ2hhbmdpbmcgPSBmYWxzZTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHJldHVybiBwbHVnaW4uY29tcG9uZW50KCdmaWVsZCcpKHtcbiAgICAgICAgZmllbGQ6IGZpZWxkLCBwbGFpbjogdGhpcy5wcm9wcy5wbGFpblxuICAgICAgfSwgUi50ZXh0YXJlYSh7XG4gICAgICAgICAgY2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZSxcbiAgICAgICAgICB2YWx1ZTogdGhpcy5zdGF0ZS52YWx1ZSxcbiAgICAgICAgICBvbkNoYW5nZTogdGhpcy5vbkNoYW5nZSxcbiAgICAgICAgICBzdHlsZToge2JhY2tncm91bmRDb2xvcjogdGhpcy5zdGF0ZS5pc1ZhbGlkID8gJycgOiAncmdiKDI1NSwyMDAsMjAwKSd9LFxuICAgICAgICAgIHJvd3M6IGZpZWxkLmRlZi5yb3dzIHx8IHRoaXMucHJvcHMucm93cyxcbiAgICAgICAgICBvbkZvY3VzOiB0aGlzLm9uRm9jdXMsXG4gICAgICAgICAgb25CbHVyOiB0aGlzLm9uQmx1clxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQubGFiZWxcblxuLypcbkp1c3QgdGhlIGxhYmVsIGZvciBhIGZpZWxkLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHZhciBsYWJlbCA9IG51bGw7XG4gICAgICBpZiAodHlwZW9mIHRoaXMucHJvcHMuaW5kZXggPT09ICdudW1iZXInKSB7XG4gICAgICAgIGxhYmVsID0gJycgKyAodGhpcy5wcm9wcy5pbmRleCArIDEpICsgJy4nO1xuICAgICAgICBpZiAoZmllbGQuZGVmLmxhYmVsKSB7XG4gICAgICAgICAgbGFiZWwgPSBsYWJlbCArICcgJyArIGZpZWxkLmRlZi5sYWJlbDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZmllbGQuZGVmLmxhYmVsIHx8IGxhYmVsKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gbGFiZWwgfHwgZmllbGQuZGVmLmxhYmVsO1xuICAgICAgICBpZiAodGhpcy5wcm9wcy5vbkNsaWNrKSB7XG4gICAgICAgICAgdGV4dCA9IFIuYSh7aHJlZjogJ0phdmFTY3JpcHQnICsgJzonLCBvbkNsaWNrOiB0aGlzLnByb3BzLm9uQ2xpY2t9LCB0ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBsYWJlbCA9IFIubGFiZWwoe30sIHRleHQpO1xuICAgICAgfVxuXG4gICAgICB2YXIgcmVxdWlyZWQgPSBSLnNwYW4oe2NsYXNzTmFtZTogJ3JlcXVpcmVkLXRleHQnfSk7XG5cbiAgICAgIHJldHVybiBSLmRpdih7XG4gICAgICAgIGNsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWVcbiAgICAgIH0sXG4gICAgICAgIGxhYmVsLFxuICAgICAgICAnICcsXG4gICAgICAgIHJlcXVpcmVkXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5saXN0LWNvbnRyb2xcblxuLypcblJlbmRlciB0aGUgaXRlbSB0eXBlIGNob2ljZXMgYW5kIHRoZSBhZGQgYnV0dG9uLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgZ2V0SW5pdGlhbFN0YXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpdGVtSW5kZXg6IDBcbiAgICAgIH07XG4gICAgfSxcblxuICAgIG9uU2VsZWN0OiBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICBpdGVtSW5kZXg6IGluZGV4XG4gICAgICB9KTtcbiAgICB9LFxuXG4gICAgb25BcHBlbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMucHJvcHMub25BcHBlbmQodGhpcy5zdGF0ZS5pdGVtSW5kZXgpO1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgdmFyIHR5cGVDaG9pY2VzID0gbnVsbDtcblxuICAgICAgaWYgKGZpZWxkLml0ZW1zKCkubGVuZ3RoID4gMCkge1xuICAgICAgICB0eXBlQ2hvaWNlcyA9IHBsdWdpbi5jb21wb25lbnQoJ2l0ZW0tY2hvaWNlcycpKHtmaWVsZDogZmllbGQsIHZhbHVlOiB0aGlzLnN0YXRlLml0ZW1JbmRleCwgb25TZWxlY3Q6IHRoaXMub25TZWxlY3R9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFIuZGl2KHtjbGFzc05hbWU6IHRoaXMucHJvcHMuY2xhc3NOYW1lfSxcbiAgICAgICAgdHlwZUNob2ljZXMsICcgJyxcbiAgICAgICAgcGx1Z2luLmNvbXBvbmVudCgnYWRkLWl0ZW0nKSh7b25DbGljazogdGhpcy5vbkFwcGVuZH0pXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5saXN0LWl0ZW0tY29udHJvbFxuXG4vKlxuUmVuZGVyIHRoZSByZW1vdmUgYW5kIG1vdmUgYnV0dG9ucyBmb3IgYSBmaWVsZC5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIG9uTW92ZUJhY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMucHJvcHMub25Nb3ZlKHRoaXMucHJvcHMuaW5kZXgsIHRoaXMucHJvcHMuaW5kZXggLSAxKTtcbiAgICB9LFxuXG4gICAgb25Nb3ZlRm9yd2FyZDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5wcm9wcy5vbk1vdmUodGhpcy5wcm9wcy5pbmRleCwgdGhpcy5wcm9wcy5pbmRleCArIDEpO1xuICAgIH0sXG5cbiAgICBvblJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5wcm9wcy5vblJlbW92ZSh0aGlzLnByb3BzLmluZGV4KTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZmllbGQgPSB0aGlzLnByb3BzLmZpZWxkO1xuXG4gICAgICByZXR1cm4gUi5kaXYoe2NsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWV9LFxuICAgICAgICBwbHVnaW4uY29tcG9uZW50KCdyZW1vdmUtaXRlbScpKHtmaWVsZDogZmllbGQsIG9uQ2xpY2s6IHRoaXMub25SZW1vdmV9KSxcbiAgICAgICAgdGhpcy5wcm9wcy5pbmRleCA+IDAgPyBwbHVnaW4uY29tcG9uZW50KCdtb3ZlLWl0ZW0tYmFjaycpKHtvbkNsaWNrOiB0aGlzLm9uTW92ZUJhY2t9KSA6IG51bGwsXG4gICAgICAgIHRoaXMucHJvcHMuaW5kZXggPCAodGhpcy5wcm9wcy5udW1JdGVtcyAtIDEpID8gcGx1Z2luLmNvbXBvbmVudCgnbW92ZS1pdGVtLWZvcndhcmQnKSh7b25DbGljazogdGhpcy5vbk1vdmVGb3J3YXJkfSkgOiBudWxsXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5saXN0LWl0ZW0tdmFsdWVcblxuLypcblJlbmRlciB0aGUgdmFsdWUgb2YgYSBsaXN0IGl0ZW0uXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xudmFyIFIgPSBSZWFjdC5ET007XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgZ2V0RGVmYXVsdFByb3BzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWU6IHBsdWdpbi5jb25maWcuY2xhc3NOYW1lXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHJldHVybiBSLmRpdih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZX0sXG4gICAgICAgIGZpZWxkLmNvbXBvbmVudCgpXG4gICAgICAgIC8vIHBsdWdpbi5jb21wb25lbnQoJ2ZpZWxkJykoe1xuICAgICAgICAvLyAgIGZpZWxkOiBmaWVsZCxcbiAgICAgICAgLy8gICBpbmRleDogdGhpcy5wcm9wcy5pbmRleFxuICAgICAgICAvLyB9LFxuICAgICAgICAvLyAgIGZpZWxkLmNvbXBvbmVudCgpXG4gICAgICAgIC8vIClcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50Lmxpc3QtaXRlbVxuXG4vKlxuUmVuZGVyIGEgbGlzdCBpdGVtLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZmllbGQgPSB0aGlzLnByb3BzLmZpZWxkO1xuXG4gICAgICByZXR1cm4gUi5kaXYoe2NsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWV9LFxuICAgICAgICBwbHVnaW4uY29tcG9uZW50KCdsaXN0LWl0ZW0tdmFsdWUnKSh7Zm9ybTogdGhpcy5wcm9wcy5mb3JtLCBmaWVsZDogZmllbGQsIGluZGV4OiB0aGlzLnByb3BzLmluZGV4fSksXG4gICAgICAgIHBsdWdpbi5jb21wb25lbnQoJ2xpc3QtaXRlbS1jb250cm9sJykoe2ZpZWxkOiBmaWVsZCwgaW5kZXg6IHRoaXMucHJvcHMuaW5kZXgsIG51bUl0ZW1zOiB0aGlzLnByb3BzLm51bUl0ZW1zLCBvbk1vdmU6IHRoaXMucHJvcHMub25Nb3ZlLCBvblJlbW92ZTogdGhpcy5wcm9wcy5vblJlbW92ZX0pXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5saXN0XG5cbi8qXG5SZW5kZXIgYSBsaXN0LlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG52YXIgQ1NTVHJhbnNpdGlvbkdyb3VwID0gUmVhY3QuY3JlYXRlRmFjdG9yeShSZWFjdC5hZGRvbnMuQ1NTVHJhbnNpdGlvbkdyb3VwKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBtaXhpbnM6IFtwbHVnaW4ucmVxdWlyZSgnbWl4aW4uZmllbGQnKV0sXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIG5leHRMb29rdXBJZDogMCxcblxuICAgIGdldEluaXRpYWxTdGF0ZTogZnVuY3Rpb24gKCkge1xuXG4gICAgICAvLyBOZWVkIHRvIGNyZWF0ZSBhcnRpZmljaWFsIGtleXMgZm9yIHRoZSBhcnJheS4gSW5kZXhlcyBhcmUgbm90IGdvb2Qga2V5cyxcbiAgICAgIC8vIHNpbmNlIHRoZXkgY2hhbmdlLiBTbywgbWFwIGVhY2ggcG9zaXRpb24gdG8gYW4gYXJ0aWZpY2lhbCBrZXlcbiAgICAgIHZhciBsb29rdXBzID0gW107XG4gICAgICB0aGlzLnByb3BzLmZpZWxkLmZpZWxkcygpLmZvckVhY2goZnVuY3Rpb24gKGZpZWxkLCBpKSB7XG4gICAgICAgIGxvb2t1cHNbaV0gPSAnXycgKyB0aGlzLm5leHRMb29rdXBJZDtcbiAgICAgICAgdGhpcy5uZXh0TG9va3VwSWQrKztcbiAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGxvb2t1cHM6IGxvb2t1cHNcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGNvbXBvbmVudFdpbGxSZWNlaXZlUHJvcHM6IGZ1bmN0aW9uIChuZXdQcm9wcykge1xuXG4gICAgICB2YXIgbG9va3VwcyA9IHRoaXMuc3RhdGUubG9va3VwcztcbiAgICAgIHZhciBmaWVsZHMgPSBuZXdQcm9wcy5maWVsZC5maWVsZHMoKTtcblxuICAgICAgLy8gTmVlZCB0byBzZXQgYXJ0aWZpY2lhbCBrZXlzIGZvciBuZXcgYXJyYXkgaXRlbXMuXG4gICAgICBpZiAoZmllbGRzLmxlbmd0aCA+IGxvb2t1cHMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBsb29rdXBzLmxlbmd0aDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGxvb2t1cHNbaV0gPSAnXycgKyB0aGlzLm5leHRMb29rdXBJZDtcbiAgICAgICAgICB0aGlzLm5leHRMb29rdXBJZCsrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICBsb29rdXBzOiBsb29rdXBzXG4gICAgICB9KTtcbiAgICB9LFxuXG4gICAgb25BcHBlbmQ6IGZ1bmN0aW9uIChpdGVtSW5kZXgpIHtcbiAgICAgIHRoaXMucHJvcHMuZmllbGQuYXBwZW5kKGl0ZW1JbmRleCk7XG4gICAgfSxcbiAgICAvL1xuICAgIC8vIG9uQ2xpY2tMYWJlbDogZnVuY3Rpb24gKGkpIHtcbiAgICAvLyAgIGlmICh0aGlzLnByb3BzLmZpZWxkLmNvbGxhcHNhYmxlSXRlbXMpIHtcbiAgICAvLyAgICAgdmFyIGNvbGxhcHNlZDtcbiAgICAvLyAgICAgLy8gaWYgKCF0aGlzLnN0YXRlLmNvbGxhcHNlZFtpXSkge1xuICAgIC8vICAgICAvLyAgIGNvbGxhcHNlZCA9IHRoaXMuc3RhdGUuY29sbGFwc2VkO1xuICAgIC8vICAgICAvLyAgIGNvbGxhcHNlZFtpXSA9IHRydWU7XG4gICAgLy8gICAgIC8vICAgdGhpcy5zZXRTdGF0ZSh7Y29sbGFwc2VkOiBjb2xsYXBzZWR9KTtcbiAgICAvLyAgICAgLy8gfSBlbHNlIHtcbiAgICAvLyAgICAgLy8gICBjb2xsYXBzZWQgPSB0aGlzLnByb3BzLmZpZWxkLmZpZWxkcy5tYXAoZnVuY3Rpb24gKCkge1xuICAgIC8vICAgICAvLyAgICAgcmV0dXJuIHRydWU7XG4gICAgLy8gICAgIC8vICAgfSk7XG4gICAgLy8gICAgIC8vICAgY29sbGFwc2VkW2ldID0gZmFsc2U7XG4gICAgLy8gICAgIC8vICAgdGhpcy5zZXRTdGF0ZSh7Y29sbGFwc2VkOiBjb2xsYXBzZWR9KTtcbiAgICAvLyAgICAgLy8gfVxuICAgIC8vICAgICBjb2xsYXBzZWQgPSB0aGlzLnN0YXRlLmNvbGxhcHNlZDtcbiAgICAvLyAgICAgY29sbGFwc2VkW2ldID0gIWNvbGxhcHNlZFtpXTtcbiAgICAvLyAgICAgdGhpcy5zZXRTdGF0ZSh7Y29sbGFwc2VkOiBjb2xsYXBzZWR9KTtcbiAgICAvLyAgIH1cbiAgICAvLyB9LFxuICAgIC8vXG4gICAgb25SZW1vdmU6IGZ1bmN0aW9uIChpKSB7XG4gICAgICB2YXIgbG9va3VwcyA9IHRoaXMuc3RhdGUubG9va3VwcztcbiAgICAgIGxvb2t1cHMuc3BsaWNlKGksIDEpO1xuICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgIGxvb2t1cHM6IGxvb2t1cHNcbiAgICAgIH0pO1xuICAgICAgdGhpcy5wcm9wcy5maWVsZC5yZW1vdmUoaSk7XG4gICAgfSxcbiAgICAvL1xuICAgIG9uTW92ZTogZnVuY3Rpb24gKGZyb21JbmRleCwgdG9JbmRleCkge1xuICAgICAgdmFyIGxvb2t1cHMgPSB0aGlzLnN0YXRlLmxvb2t1cHM7XG4gICAgICB2YXIgZnJvbUlkID0gbG9va3Vwc1tmcm9tSW5kZXhdO1xuICAgICAgdmFyIHRvSWQgPSBsb29rdXBzW3RvSW5kZXhdO1xuICAgICAgbG9va3Vwc1tmcm9tSW5kZXhdID0gdG9JZDtcbiAgICAgIGxvb2t1cHNbdG9JbmRleF0gPSBmcm9tSWQ7XG4gICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgbG9va3VwczogbG9va3Vwc1xuICAgICAgfSk7XG4gICAgICB0aGlzLnByb3BzLmZpZWxkLm1vdmUoZnJvbUluZGV4LCB0b0luZGV4KTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG4gICAgICB2YXIgZmllbGRzID0gZmllbGQuZmllbGRzKCk7XG5cbiAgICAgIHZhciBudW1JdGVtcyA9IGZpZWxkcy5sZW5ndGg7XG4gICAgICByZXR1cm4gcGx1Z2luLmNvbXBvbmVudCgnZmllbGQnKSh7XG4gICAgICAgIGZpZWxkOiBmaWVsZCwgcGxhaW46IHRoaXMucHJvcHMucGxhaW5cbiAgICAgIH0sXG4gICAgICAgIFIuZGl2KHtjbGFzc05hbWU6IHRoaXMucHJvcHMuY2xhc3NOYW1lfSxcbiAgICAgICAgICBDU1NUcmFuc2l0aW9uR3JvdXAoe3RyYW5zaXRpb25OYW1lOiAncmV2ZWFsJ30sXG4gICAgICAgICAgICBmaWVsZHMubWFwKGZ1bmN0aW9uIChjaGlsZCwgaSkge1xuICAgICAgICAgICAgICByZXR1cm4gcGx1Z2luLmNvbXBvbmVudCgnbGlzdC1pdGVtJykoe1xuICAgICAgICAgICAgICAgIGtleTogdGhpcy5zdGF0ZS5sb29rdXBzW2ldLFxuICAgICAgICAgICAgICAgIGZvcm06IHRoaXMucHJvcHMuZm9ybSxcbiAgICAgICAgICAgICAgICBmaWVsZDogY2hpbGQsXG4gICAgICAgICAgICAgICAgcGFyZW50OiBmaWVsZCxcbiAgICAgICAgICAgICAgICBpbmRleDogaSxcbiAgICAgICAgICAgICAgICBudW1JdGVtczogbnVtSXRlbXMsXG4gICAgICAgICAgICAgICAgb25Nb3ZlOiB0aGlzLm9uTW92ZSxcbiAgICAgICAgICAgICAgICBvblJlbW92ZTogdGhpcy5vblJlbW92ZVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgICAgICApLFxuICAgICAgICAgIHBsdWdpbi5jb21wb25lbnQoJ2xpc3QtY29udHJvbCcpKHtmaWVsZDogZmllbGQsIG9uQXBwZW5kOiB0aGlzLm9uQXBwZW5kfSlcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQubW92ZS1pdGVtLWJhY2tcblxuLypcbkJ1dHRvbiB0byBtb3ZlIGFuIGl0ZW0gYmFja3dhcmRzIGluIGxpc3QuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xudmFyIFIgPSBSZWFjdC5ET007XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgZ2V0RGVmYXVsdFByb3BzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWU6IHBsdWdpbi5jb25maWcuY2xhc3NOYW1lLFxuICAgICAgICBsYWJlbDogcGx1Z2luLmNvbmZpZ1ZhbHVlKCdsYWJlbCcsICdbdXBdJylcbiAgICAgIH07XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFIuc3Bhbih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZSwgb25DbGljazogdGhpcy5wcm9wcy5vbkNsaWNrfSwgdGhpcy5wcm9wcy5sYWJlbCk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50Lm1vdmUtaXRlbS1mb3J3YXJkXG5cbi8qXG5CdXR0b24gdG8gbW92ZSBhbiBpdGVtIGZvcndhcmQgaW4gYSBsaXN0LlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZSxcbiAgICAgICAgbGFiZWw6IHBsdWdpbi5jb25maWdWYWx1ZSgnbGFiZWwnLCAnW2Rvd25dJylcbiAgICAgIH07XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFIuc3Bhbih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZSwgb25DbGljazogdGhpcy5wcm9wcy5vbkNsaWNrfSwgdGhpcy5wcm9wcy5sYWJlbCk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50Lm9iamVjdC1jb250cm9sXG5cbi8qXG5SZW5kZXIgdGhlIGl0ZW0gdHlwZSBjaG9pY2VzIGFuZCB0aGUgYWRkIGJ1dHRvbi5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGdldEluaXRpYWxTdGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaXRlbUluZGV4OiAwXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICBvblNlbGVjdDogZnVuY3Rpb24gKGluZGV4KSB7XG4gICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgaXRlbUluZGV4OiBpbmRleFxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIG9uQXBwZW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnByb3BzLm9uQXBwZW5kKHRoaXMuc3RhdGUuaXRlbUluZGV4KTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHZhciB0eXBlQ2hvaWNlcyA9IG51bGw7XG5cbiAgICAgIGlmIChmaWVsZC5pdGVtcygpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdHlwZUNob2ljZXMgPSBwbHVnaW4uY29tcG9uZW50KCdpdGVtLWNob2ljZXMnKSh7ZmllbGQ6IGZpZWxkLCB2YWx1ZTogdGhpcy5zdGF0ZS5pdGVtSW5kZXgsIG9uU2VsZWN0OiB0aGlzLm9uU2VsZWN0fSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBSLmRpdih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZX0sXG4gICAgICAgIHR5cGVDaG9pY2VzLCAnICcsXG4gICAgICAgIHBsdWdpbi5jb21wb25lbnQoJ2FkZC1pdGVtJykoe29uQ2xpY2s6IHRoaXMub25BcHBlbmR9KVxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQub2JqZWN0LWl0ZW0tY29udHJvbFxuXG4vKlxuUmVuZGVyIHRoZSByZW1vdmUgYnV0dG9ucyBmb3IgYW4gb2JqZWN0IGl0ZW0uXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xudmFyIFIgPSBSZWFjdC5ET007XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgZ2V0RGVmYXVsdFByb3BzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWU6IHBsdWdpbi5jb25maWcuY2xhc3NOYW1lXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICBvblJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5wcm9wcy5vblJlbW92ZSh0aGlzLnByb3BzLmZpZWxkLmRlZi5rZXkpO1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHJldHVybiBSLmRpdih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZX0sXG4gICAgICAgIHBsdWdpbi5jb21wb25lbnQoJ3JlbW92ZS1pdGVtJykoe2ZpZWxkOiBmaWVsZCwgb25DbGljazogdGhpcy5vblJlbW92ZX0pXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5vYmplY3QtaXRlbS1rZXlcblxuLypcblJlbmRlciBhbiBvYmplY3QgaXRlbSBrZXkgZWRpdG9yLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgZ2V0RGVmYXVsdFByb3BzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWU6IHBsdWdpbi5jb25maWcuY2xhc3NOYW1lXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICBvbkNoYW5nZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICB0aGlzLnByb3BzLm9uQ2hhbmdlKGV2ZW50LnRhcmdldC52YWx1ZSk7XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgdmFyIGtleSA9IGZpZWxkLmRlZi5rZXk7XG5cbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZCh0aGlzLnByb3BzLnRlbXBLZXkpKSB7XG4gICAgICAgIGtleSA9IHRoaXMucHJvcHMudGVtcEtleTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFIuaW5wdXQoe2NsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWUsIHR5cGU6ICd0ZXh0JywgdmFsdWU6IGtleSwgb25DaGFuZ2U6IHRoaXMub25DaGFuZ2V9KTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQub2JqZWN0LWl0ZW0tdmFsdWVcblxuLypcblJlbmRlciB0aGUgdmFsdWUgb2YgYW4gb2JqZWN0IGl0ZW0uXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xudmFyIFIgPSBSZWFjdC5ET007XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgZ2V0RGVmYXVsdFByb3BzOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWU6IHBsdWdpbi5jb25maWcuY2xhc3NOYW1lXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHJldHVybiBSLmRpdih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZX0sXG4gICAgICAgIGZpZWxkLmNvbXBvbmVudCh7cGxhaW46IHRydWV9KVxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQub2JqZWN0LWl0ZW1cblxuLypcblJlbmRlciBhbiBvYmplY3QgaXRlbS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIG9uQ2hhbmdlS2V5OiBmdW5jdGlvbiAobmV3S2V5KSB7XG4gICAgICB0aGlzLnByb3BzLm9uTW92ZSh0aGlzLnByb3BzLmZpZWxkLmRlZi5rZXksIG5ld0tleSk7XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgcmV0dXJuIFIuZGl2KHtjbGFzc05hbWU6IHRoaXMucHJvcHMuY2xhc3NOYW1lfSxcbiAgICAgICAgcGx1Z2luLmNvbXBvbmVudCgnb2JqZWN0LWl0ZW0ta2V5Jykoe2Zvcm06IHRoaXMucHJvcHMuZm9ybSwgZmllbGQ6IGZpZWxkLCBvbkNoYW5nZTogdGhpcy5vbkNoYW5nZUtleSwgdGVtcEtleTogdGhpcy5wcm9wcy50ZW1wS2V5fSksXG4gICAgICAgIHBsdWdpbi5jb21wb25lbnQoJ29iamVjdC1pdGVtLXZhbHVlJykoe2Zvcm06IHRoaXMucHJvcHMuZm9ybSwgZmllbGQ6IGZpZWxkfSksXG4gICAgICAgIHBsdWdpbi5jb21wb25lbnQoJ29iamVjdC1pdGVtLWNvbnRyb2wnKSh7ZmllbGQ6IGZpZWxkLCBudW1JdGVtczogdGhpcy5wcm9wcy5udW1JdGVtcywgb25SZW1vdmU6IHRoaXMucHJvcHMub25SZW1vdmV9KVxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQub2JqZWN0XG5cbi8qXG5SZW5kZXIgYW4gb2JqZWN0LlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG52YXIgQ1NTVHJhbnNpdGlvbkdyb3VwID0gUmVhY3QuY3JlYXRlRmFjdG9yeShSZWFjdC5hZGRvbnMuQ1NTVHJhbnNpdGlvbkdyb3VwKTtcblxudmFyIHRlbXBLZXlQcmVmaXggPSAnJCRfX3RlbXBfXyc7XG5cbnZhciB0ZW1wS2V5ID0gZnVuY3Rpb24gKGlkKSB7XG4gIHJldHVybiB0ZW1wS2V5UHJlZml4ICsgaWQ7XG59O1xuXG52YXIgaXNUZW1wS2V5ID0gZnVuY3Rpb24gKGtleSkge1xuICByZXR1cm4ga2V5LnN1YnN0cmluZygwLCB0ZW1wS2V5UHJlZml4Lmxlbmd0aCkgPT09IHRlbXBLZXlQcmVmaXg7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIG1peGluczogW3BsdWdpbi5yZXF1aXJlKCdtaXhpbi5maWVsZCcpXSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgbmV4dExvb2t1cElkOiAwLFxuXG4gICAgZ2V0SW5pdGlhbFN0YXRlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIHZhciBrZXlUb0lkID0ge307XG4gICAgICB2YXIgZmllbGRzID0gdGhpcy5wcm9wcy5maWVsZC5maWVsZHMoKTtcbiAgICAgIHZhciBrZXlUb0ZpZWxkID0ge307XG4gICAgICB2YXIga2V5T3JkZXIgPSBbXTtcblxuICAgICAgLy8gS2V5cyBkb24ndCBtYWtlIGdvb2QgcmVhY3Qga2V5cywgc2luY2Ugd2UncmUgYWxsb3dpbmcgdGhlbSB0byBiZVxuICAgICAgLy8gY2hhbmdlZCBoZXJlLCBzbyB3ZSdsbCBoYXZlIHRvIGNyZWF0ZSBmYWtlIGtleXMgYW5kXG4gICAgICAvLyBrZWVwIHRyYWNrIG9mIHRoZSBtYXBwaW5nIG9mIHJlYWwga2V5cyB0byBmYWtlIGtleXMuIFl1Y2suXG4gICAgICBmaWVsZHMuZm9yRWFjaChmdW5jdGlvbiAoZmllbGQpIHtcbiAgICAgICAgdGhpcy5uZXh0TG9va3VwSWQrKztcbiAgICAgICAga2V5VG9JZFtmaWVsZC5kZWYua2V5XSA9IHRoaXMubmV4dExvb2t1cElkO1xuICAgICAgICBrZXlUb0ZpZWxkW2ZpZWxkLmRlZi5rZXldID0gZmllbGQ7XG4gICAgICAgIGtleU9yZGVyLnB1c2goZmllbGQuZGVmLmtleSk7XG4gICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBrZXlUb0lkOiBrZXlUb0lkLFxuICAgICAgICBrZXlUb0ZpZWxkOiBrZXlUb0ZpZWxkLFxuICAgICAgICBrZXlPcmRlcjoga2V5T3JkZXIsXG4gICAgICAgIHRlbXBLZXlzOiB7fVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgY29tcG9uZW50V2lsbFJlY2VpdmVQcm9wczogZnVuY3Rpb24gKG5ld1Byb3BzKSB7XG5cbiAgICAgIHZhciBrZXlUb0lkID0gdGhpcy5zdGF0ZS5rZXlUb0lkO1xuICAgICAgdmFyIG5ld0tleVRvSWQgPSB7fTtcbiAgICAgIHZhciBuZXdLZXlUb0ZpZWxkID0ge307XG4gICAgICB2YXIgdGVtcEtleXMgPSB0aGlzLnN0YXRlLnRlbXBLZXlzO1xuICAgICAgdmFyIG5ld1RlbXBLZXlzID0ge307XG4gICAgICB2YXIga2V5T3JkZXIgPSB0aGlzLnN0YXRlLmtleU9yZGVyO1xuICAgICAgdmFyIGZpZWxkcyA9IG5ld1Byb3BzLmZpZWxkLmZpZWxkcygpO1xuICAgICAgdmFyIGFkZGVkS2V5cyA9IFtdO1xuXG4gICAgICAvLyBMb29rIGF0IHRoZSBuZXcgZmllbGRzLlxuICAgICAgZmllbGRzLmZvckVhY2goZnVuY3Rpb24gKGZpZWxkKSB7XG4gICAgICAgIC8vIEFkZCBuZXcgbG9va3VwIGlmIHRoaXMga2V5IHdhc24ndCBoZXJlIGxhc3QgdGltZS5cbiAgICAgICAgaWYgKCFrZXlUb0lkW2ZpZWxkLmRlZi5rZXldKSB7XG4gICAgICAgICAgdGhpcy5uZXh0TG9va3VwSWQrKztcbiAgICAgICAgICBuZXdLZXlUb0lkW2ZpZWxkLmRlZi5rZXldID0gdGhpcy5uZXh0TG9va3VwSWQ7XG4gICAgICAgICAgYWRkZWRLZXlzLnB1c2goZmllbGQuZGVmLmtleSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbmV3S2V5VG9JZFtmaWVsZC5kZWYua2V5XSA9IGtleVRvSWRbZmllbGQuZGVmLmtleV07XG4gICAgICAgIH1cbiAgICAgICAgbmV3S2V5VG9GaWVsZFtmaWVsZC5kZWYua2V5XSA9IGZpZWxkO1xuICAgICAgICBpZiAoaXNUZW1wS2V5KGZpZWxkLmRlZi5rZXkpICYmIG5ld0tleVRvSWRbZmllbGQuZGVmLmtleV0gaW4gdGVtcEtleXMpIHtcbiAgICAgICAgICBuZXdUZW1wS2V5c1tuZXdLZXlUb0lkW2ZpZWxkLmRlZi5rZXldXSA9IHRlbXBLZXlzW25ld0tleVRvSWRbZmllbGQuZGVmLmtleV1dO1xuICAgICAgICB9XG4gICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICB2YXIgbmV3S2V5T3JkZXIgPSBbXTtcblxuICAgICAgLy8gTG9vayBhdCB0aGUgb2xkIGZpZWxkcy5cbiAgICAgIGtleU9yZGVyLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICBpZiAobmV3S2V5VG9GaWVsZFtrZXldKSB7XG4gICAgICAgICAgbmV3S2V5T3JkZXIucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gUHV0IGFkZGVkIGZpZWxkcyBhdCB0aGUgZW5kLiAoU28gdGhpbmdzIGRvbid0IGdldCBzaHVmZmxlZC4pXG4gICAgICBuZXdLZXlPcmRlciA9IG5ld0tleU9yZGVyLmNvbmNhdChhZGRlZEtleXMpO1xuXG4gICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAga2V5VG9JZDogbmV3S2V5VG9JZCxcbiAgICAgICAga2V5VG9GaWVsZDogbmV3S2V5VG9GaWVsZCxcbiAgICAgICAga2V5T3JkZXI6IG5ld0tleU9yZGVyLFxuICAgICAgICB0ZW1wS2V5czogbmV3VGVtcEtleXNcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBvbkFwcGVuZDogZnVuY3Rpb24gKGl0ZW1JbmRleCkge1xuICAgICAgdGhpcy5uZXh0TG9va3VwSWQrKztcblxuICAgICAgdmFyIGtleVRvSWQgPSB0aGlzLnN0YXRlLmtleVRvSWQ7XG4gICAgICB2YXIga2V5T3JkZXIgPSB0aGlzLnN0YXRlLmtleU9yZGVyO1xuICAgICAgdmFyIHRlbXBLZXlzID0gdGhpcy5zdGF0ZS50ZW1wS2V5cztcblxuICAgICAgdmFyIGlkID0gdGhpcy5uZXh0TG9va3VwSWQ7XG4gICAgICB2YXIgbmV3S2V5ID0gdGVtcEtleShpZCk7XG5cbiAgICAgIGtleVRvSWRbbmV3S2V5XSA9IGlkO1xuICAgICAgdGVtcEtleXNbaWRdID0gJyc7XG4gICAgICBrZXlPcmRlci5wdXNoKG5ld0tleSk7XG5cbiAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICBrZXlUb0lkOiBrZXlUb0lkLFxuICAgICAgICB0ZW1wS2V5czogdGVtcEtleXMsXG4gICAgICAgIGtleU9yZGVyOiBrZXlPcmRlclxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMucHJvcHMuZmllbGQuYXBwZW5kKGl0ZW1JbmRleCwgbmV3S2V5KTtcbiAgICB9LFxuXG4gICAgb25SZW1vdmU6IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHRoaXMucHJvcHMuZmllbGQucmVtb3ZlKGtleSk7XG4gICAgfSxcblxuICAgIG9uTW92ZTogZnVuY3Rpb24gKGZyb21LZXksIHRvS2V5KSB7XG4gICAgICBpZiAoZnJvbUtleSAhPT0gdG9LZXkpIHtcbiAgICAgICAgdmFyIGtleVRvSWQgPSB0aGlzLnN0YXRlLmtleVRvSWQ7XG4gICAgICAgIHZhciBrZXlPcmRlciA9IHRoaXMuc3RhdGUua2V5T3JkZXI7XG4gICAgICAgIHZhciB0ZW1wS2V5cyA9IHRoaXMuc3RhdGUudGVtcEtleXM7XG5cbiAgICAgICAgaWYgKGtleVRvSWRbdG9LZXldKSB7XG4gICAgICAgICAgdmFyIHRlbXBUb0tleSA9IHRlbXBLZXkoa2V5VG9JZFt0b0tleV0pO1xuICAgICAgICAgIHRlbXBLZXlzW2tleVRvSWRbdG9LZXldXSA9IHRvS2V5O1xuICAgICAgICAgIGtleVRvSWRbdGVtcFRvS2V5XSA9IGtleVRvSWRbdG9LZXldO1xuICAgICAgICAgIGtleU9yZGVyW2tleU9yZGVyLmluZGV4T2YodG9LZXkpXSA9IHRlbXBUb0tleTtcbiAgICAgICAgICBkZWxldGUga2V5VG9JZFt0b0tleV07XG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgICBrZXlUb0lkOiBrZXlUb0lkLFxuICAgICAgICAgICAgdGVtcEtleXM6IHRlbXBLZXlzLFxuICAgICAgICAgICAga2V5T3JkZXI6IGtleU9yZGVyXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgdGhpcy5wcm9wcy5maWVsZC5tb3ZlKHRvS2V5LCB0ZW1wVG9LZXkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0b0tleSkge1xuICAgICAgICAgIHRvS2V5ID0gdGVtcEtleShrZXlUb0lkW2Zyb21LZXldKTtcbiAgICAgICAgICB0ZW1wS2V5c1trZXlUb0lkW2Zyb21LZXldXSA9ICcnO1xuICAgICAgICB9XG4gICAgICAgIGtleVRvSWRbdG9LZXldID0ga2V5VG9JZFtmcm9tS2V5XTtcbiAgICAgICAga2V5T3JkZXJba2V5T3JkZXIuaW5kZXhPZihmcm9tS2V5KV0gPSB0b0tleTtcblxuICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICBrZXlUb0lkOiBrZXlUb0lkLFxuICAgICAgICAgIGtleU9yZGVyOiBrZXlPcmRlclxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnByb3BzLmZpZWxkLm1vdmUoZnJvbUtleSwgdG9LZXkpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcbiAgICAgIHZhciBmaWVsZHMgPSB0aGlzLnN0YXRlLmtleU9yZGVyLm1hcChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRlLmtleVRvRmllbGRba2V5XTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgIHJldHVybiBwbHVnaW4uY29tcG9uZW50KCdmaWVsZCcpKHtcbiAgICAgICAgZmllbGQ6IGZpZWxkLCBwbGFpbjogdGhpcy5wcm9wcy5wbGFpblxuICAgICAgfSxcbiAgICAgICAgUi5kaXYoe2NsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWV9LFxuICAgICAgICAgIENTU1RyYW5zaXRpb25Hcm91cCh7dHJhbnNpdGlvbk5hbWU6ICdyZXZlYWwnfSxcbiAgICAgICAgICAgIGZpZWxkcy5tYXAoZnVuY3Rpb24gKGNoaWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBwbHVnaW4uY29tcG9uZW50KCdvYmplY3QtaXRlbScpKHtcbiAgICAgICAgICAgICAgICBrZXk6IHRoaXMuc3RhdGUua2V5VG9JZFtjaGlsZC5kZWYua2V5XSxcbiAgICAgICAgICAgICAgICBmb3JtOiB0aGlzLnByb3BzLmZvcm0sXG4gICAgICAgICAgICAgICAgZmllbGQ6IGNoaWxkLFxuICAgICAgICAgICAgICAgIHBhcmVudDogZmllbGQsXG4gICAgICAgICAgICAgICAgb25Nb3ZlOiB0aGlzLm9uTW92ZSxcbiAgICAgICAgICAgICAgICBvblJlbW92ZTogdGhpcy5vblJlbW92ZSxcbiAgICAgICAgICAgICAgICB0ZW1wS2V5OiB0aGlzLnN0YXRlLnRlbXBLZXlzW3RoaXMuc3RhdGUua2V5VG9JZFtjaGlsZC5kZWYua2V5XV1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgICAgKSxcbiAgICAgICAgICBwbHVnaW4uY29tcG9uZW50KCdvYmplY3QtY29udHJvbCcpKHtmaWVsZDogZmllbGQsIG9uQXBwZW5kOiB0aGlzLm9uQXBwZW5kfSlcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQucHJldHR5LXRleHRhcmVhXG5cbi8qXG5UZXh0YXJlYSB0aGF0IHdpbGwgZGlzcGxheSBoaWdobGlnaHRzIGJlaGluZCBcInRhZ3NcIi4gVGFncyBjdXJyZW50bHkgbWVhbiB0ZXh0XG50aGF0IGlzIGVuY2xvc2VkIGluIGJyYWNlcyBsaWtlIGB7e2Zvb319YC4gVGFncyBhcmUgcmVwbGFjZWQgd2l0aCBsYWJlbHMgaWZcbmF2YWlsYWJsZSBvciBodW1hbml6ZWQuXG5cblRoaXMgY29tcG9uZW50IGlzIHF1aXRlIGNvbXBsaWNhdGVkIGJlY2F1c2U6XG4tIFdlIGFyZSBkaXNwbGF5aW5nIHRleHQgaW4gdGhlIHRleHRhcmVhIGJ1dCBoYXZlIHRvIGtlZXAgdHJhY2sgb2YgdGhlIHJlYWxcbiAgdGV4dCB2YWx1ZSBpbiB0aGUgYmFja2dyb3VuZC4gV2UgY2FuJ3QgdXNlIGEgZGF0YSBhdHRyaWJ1dGUsIGJlY2F1c2UgaXQncyBhXG4gIHRleHRhcmVhLCBzbyB3ZSBjYW4ndCB1c2UgYW55IGVsZW1lbnRzIGF0IGFsbCFcbi0gQmVjYXVzZSBvZiB0aGUgaGlkZGVuIGRhdGEsIHdlIGFsc28gaGF2ZSB0byBkbyBzb21lIGludGVyY2VwdGlvbiBvZlxuICBjb3B5LCB3aGljaCBpcyBhIGxpdHRsZSB3ZWlyZC4gV2UgaW50ZXJjZXB0IGNvcHkgYW5kIGNvcHkgdGhlIHJlYWwgdGV4dFxuICB0byB0aGUgZW5kIG9mIHRoZSB0ZXh0YXJlYS4gVGhlbiB3ZSBlcmFzZSB0aGF0IHRleHQsIHdoaWNoIGxlYXZlcyB0aGUgY29waWVkXG4gIGRhdGEgaW4gdGhlIGJ1ZmZlci5cbi0gUmVhY3QgbG9zZXMgdGhlIGNhcmV0IHBvc2l0aW9uIHdoZW4geW91IHVwZGF0ZSB0aGUgdmFsdWUgdG8gc29tZXRoaW5nXG4gIGRpZmZlcmVudCB0aGFuIGJlZm9yZS4gU28gd2UgaGF2ZSB0byByZXRhaW4gdHJhY2tpbmcgaW5mb3JtYXRpb24gZm9yIHdoZW5cbiAgdGhhdCBoYXBwZW5zLlxuLSBCZWNhdXNlIHdlIG1vbmtleSB3aXRoIGNvcHksIHdlIGFsc28gaGF2ZSB0byBkbyBvdXIgb3duIHVuZG8vcmVkby4gT3RoZXJ3aXNlXG4gIHRoZSBkZWZhdWx0IHVuZG8gd2lsbCBoYXZlIHdlaXJkIHN0YXRlcyBpbiBpdC5cblxuU28gZ29vZCBsdWNrIVxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbnZhciBub0JyZWFrID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC8gL2csICdcXHUwMGEwJyk7XG59O1xuXG52YXIgTEVGVF9QQUQgPSAnXFx1MDBhMFxcdTAwYTAnO1xuLy8gV2h5IHRoaXMgd29ya3MsIEknbSBub3Qgc3VyZS5cbnZhciBSSUdIVF9QQUQgPSAnICAnOyAvLydcXHUwMGEwXFx1MDBhMCc7XG5cbnZhciBpZFByZWZpeFJlZ0V4ID0gL15bMC05XStfXy87XG5cbi8vIFphcGllciBzcGVjaWZpYyBzdHVmZi4gTWFrZSBhIHBsdWdpbiBmb3IgdGhpcyBsYXRlci5cbnZhciByZW1vdmVJZFByZWZpeCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgaWYgKGlkUHJlZml4UmVnRXgudGVzdChrZXkpKSB7XG4gICAgcmV0dXJuIGtleS5yZXBsYWNlKGlkUHJlZml4UmVnRXgsICcnKTtcbiAgfVxuICByZXR1cm4ga2V5O1xufTtcblxudmFyIHBvc2l0aW9uSW5Ob2RlID0gZnVuY3Rpb24gKHBvc2l0aW9uLCBub2RlKSB7XG4gIHZhciByZWN0ID0gbm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgaWYgKHBvc2l0aW9uLnggPj0gcmVjdC5sZWZ0ICYmIHBvc2l0aW9uLnggPD0gcmVjdC5yaWdodCkge1xuICAgIGlmIChwb3NpdGlvbi55ID49IHJlY3QudG9wICYmIHBvc2l0aW9uLnkgPD0gcmVjdC5ib3R0b20pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgdmFyIHV0aWwgPSBwbHVnaW4ucmVxdWlyZSgndXRpbCcpO1xuXG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6IHBsdWdpbi5uYW1lLFxuXG4gICAgbWl4aW5zOiBbcGx1Z2luLnJlcXVpcmUoJ21peGluLmZpZWxkJyksIHBsdWdpbi5yZXF1aXJlKCdtaXhpbi51bmRvLXN0YWNrJyksIHBsdWdpbi5yZXF1aXJlKCdtaXhpbi5yZXNpemUnKV0sXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWVcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGdldEluaXRpYWxTdGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdW5kb0RlcHRoOiAxMDAsXG4gICAgICAgIGlzQ2hvaWNlc09wZW46IGZhbHNlLFxuICAgICAgICBob3ZlclBpbGxSZWY6IG51bGxcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGNvbXBvbmVudFdpbGxNb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgLy8gTm90IHF1aXRlIHN0YXRlLCB0aGlzIGlzIGZvciB0cmFja2luZyBzZWxlY3Rpb24gaW5mby5cbiAgICAgIHRoaXMudHJhY2tpbmcgPSB7fTtcblxuICAgICAgdmFyIHBhcnRzID0gdXRpbC5wYXJzZVRleHRXaXRoVGFncyh0aGlzLnByb3BzLmZpZWxkLnZhbHVlKTtcbiAgICAgIHZhciB0b2tlbnMgPSB0aGlzLnRva2VucyhwYXJ0cyk7XG4gICAgICB2YXIgaW5kZXhNYXAgPSB0aGlzLmluZGV4TWFwKHRva2Vucyk7XG5cbiAgICAgIHRoaXMudHJhY2tpbmcucG9zID0gaW5kZXhNYXAubGVuZ3RoO1xuICAgICAgdGhpcy50cmFja2luZy5yYW5nZSA9IDA7XG4gICAgICB0aGlzLnRyYWNraW5nLnRva2VucyA9IHRva2VucztcbiAgICAgIHRoaXMudHJhY2tpbmcuaW5kZXhNYXAgPSBpbmRleE1hcDtcbiAgICB9LFxuXG4gICAgZ2V0U3RhdGVTbmFwc2hvdDogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdmFsdWU6IHRoaXMucHJvcHMuZmllbGQudmFsdWUsXG4gICAgICAgIHBvczogdGhpcy50cmFja2luZy5wb3MsXG4gICAgICAgIHJhbmdlOiB0aGlzLnRyYWNraW5nLnJhbmdlXG4gICAgICB9O1xuICAgIH0sXG5cbiAgICBzZXRTdGF0ZVNuYXBzaG90OiBmdW5jdGlvbiAoc25hcHNob3QpIHtcbiAgICAgIHRoaXMudHJhY2tpbmcucG9zID0gc25hcHNob3QucG9zO1xuICAgICAgdGhpcy50cmFja2luZy5yYW5nZSA9IHNuYXBzaG90LnJhbmdlO1xuICAgICAgdGhpcy5wcm9wcy5maWVsZC52YWwoc25hcHNob3QudmFsdWUpO1xuICAgIH0sXG5cbiAgICAvLyBUdXJuIGludG8gaW5kaXZpZHVhbCBjaGFyYWN0ZXJzIGFuZCB0YWdzXG4gICAgdG9rZW5zOiBmdW5jdGlvbiAocGFydHMpIHtcbiAgICAgIHJldHVybiBbXS5jb25jYXQuYXBwbHkoW10sIHBhcnRzLm1hcChmdW5jdGlvbiAocGFydCkge1xuICAgICAgICBpZiAocGFydC50eXBlID09PSAndGFnJykge1xuICAgICAgICAgIHJldHVybiBwYXJ0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBwYXJ0LnZhbHVlLnNwbGl0KCcnKTtcbiAgICAgICAgfVxuICAgICAgfSkpO1xuICAgIH0sXG5cbiAgICAvLyBNYXAgZWFjaCB0ZXh0YXJlYSBpbmRleCBiYWNrIHRvIGEgdG9rZW5cbiAgICBpbmRleE1hcDogZnVuY3Rpb24gKHRva2Vucykge1xuICAgICAgdmFyIGluZGV4TWFwID0gW107XG4gICAgICBfLmVhY2godG9rZW5zLCBmdW5jdGlvbiAodG9rZW4sIHRva2VuSW5kZXgpIHtcbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09ICd0YWcnKSB7XG4gICAgICAgICAgdmFyIGxhYmVsID0gTEVGVF9QQUQgKyBub0JyZWFrKHRoaXMucHJldHR5TGFiZWwodG9rZW4udmFsdWUpKSArIFJJR0hUX1BBRDtcbiAgICAgICAgICB2YXIgbGFiZWxDaGFycyA9IGxhYmVsLnNwbGl0KCcnKTtcbiAgICAgICAgICBfLmVhY2gobGFiZWxDaGFycywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaW5kZXhNYXAucHVzaCh0b2tlbkluZGV4KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbmRleE1hcC5wdXNoKHRva2VuSW5kZXgpO1xuICAgICAgICB9XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgcmV0dXJuIGluZGV4TWFwO1xuICAgIH0sXG5cbiAgICAvLyBNYWtlIGhpZ2hsaWdodCBzY3JvbGwgbWF0Y2ggdGV4dGFyZWEgc2Nyb2xsXG4gICAgb25TY3JvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMucmVmcy5oaWdobGlnaHQuZ2V0RE9NTm9kZSgpLnNjcm9sbFRvcCA9IHRoaXMucmVmcy5jb250ZW50LmdldERPTU5vZGUoKS5zY3JvbGxUb3A7XG4gICAgICB0aGlzLnJlZnMuaGlnaGxpZ2h0LmdldERPTU5vZGUoKS5zY3JvbGxMZWZ0ID0gdGhpcy5yZWZzLmNvbnRlbnQuZ2V0RE9NTm9kZSgpLnNjcm9sbExlZnQ7XG4gICAgfSxcblxuICAgIC8vIEdpdmVuIHNvbWUgcG9zdGlvbiwgcmV0dXJuIHRoZSB0b2tlbiBpbmRleCAocG9zaXRpb24gY291bGQgYmUgaW4gdGhlIG1pZGRsZSBvZiBhIHRva2VuKVxuICAgIHRva2VuSW5kZXg6IGZ1bmN0aW9uIChwb3MsIHRva2VucywgaW5kZXhNYXApIHtcbiAgICAgIGlmIChwb3MgPCAwKSB7XG4gICAgICAgIHBvcyA9IDA7XG4gICAgICB9IGVsc2UgaWYgKHBvcyA+PSBpbmRleE1hcC5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRva2Vucy5sZW5ndGg7XG4gICAgICB9XG4gICAgICByZXR1cm4gaW5kZXhNYXBbcG9zXTtcbiAgICB9LFxuXG4gICAgb25DaGFuZ2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgLy9jb25zb2xlLmxvZygnY2hhbmdlOicsIGV2ZW50LnRhcmdldC52YWx1ZSk7XG5cbiAgICAgIHZhciBub2RlID0gZXZlbnQudGFyZ2V0O1xuXG4gICAgICAvLyBUcmFja2luZyBpcyBob2xkaW5nIHByZXZpb3VzIHBvc2l0aW9uIGFuZCByYW5nZVxuICAgICAgdmFyIHByZXZQb3MgPSB0aGlzLnRyYWNraW5nLnBvcztcbiAgICAgIHZhciBwcmV2UmFuZ2UgPSB0aGlzLnRyYWNraW5nLnJhbmdlO1xuXG4gICAgICAvLyBOZXcgcG9zaXRpb25cbiAgICAgIHZhciBwb3MgPSBub2RlLnNlbGVjdGlvblN0YXJ0O1xuXG4gICAgICAvLyBHb2luZyB0byBtdXRhdGUgdGhlIHRva2Vucy5cbiAgICAgIHZhciB0b2tlbnMgPSB0aGlzLnRyYWNraW5nLnRva2VucztcblxuICAgICAgLy8gVXNpbmcgdGhlIHByZXZpb3VzIHBvc2l0aW9uIGFuZCByYW5nZSwgZ2V0IHRoZSBwcmV2aW91cyB0b2tlbiBwb3NpdGlvblxuICAgICAgLy8gYW5kIHJhbmdlXG4gICAgICB2YXIgcHJldlRva2VuSW5kZXggPSB0aGlzLnRva2VuSW5kZXgocHJldlBvcywgdG9rZW5zLCB0aGlzLnRyYWNraW5nLmluZGV4TWFwKTtcbiAgICAgIHZhciBwcmV2VG9rZW5FbmRJbmRleCA9IHRoaXMudG9rZW5JbmRleChwcmV2UG9zICsgcHJldlJhbmdlLCB0b2tlbnMsIHRoaXMudHJhY2tpbmcuaW5kZXhNYXApO1xuICAgICAgdmFyIHByZXZUb2tlblJhbmdlID0gcHJldlRva2VuRW5kSW5kZXggLSBwcmV2VG9rZW5JbmRleDtcblxuICAgICAgLy8gV2lwZSBvdXQgYW55IHRva2VucyBpbiB0aGUgc2VsZWN0ZWQgcmFuZ2UgYmVjYXVzZSB0aGUgY2hhbmdlIHdvdWxkIGhhdmVcbiAgICAgIC8vIGVyYXNlZCB0aGF0IHNlbGVjdGlvbi5cbiAgICAgIGlmIChwcmV2VG9rZW5SYW5nZSA+IDApIHtcbiAgICAgICAgdG9rZW5zLnNwbGljZShwcmV2VG9rZW5JbmRleCwgcHJldlRva2VuUmFuZ2UpO1xuICAgICAgICB0aGlzLnRyYWNraW5nLmluZGV4TWFwID0gdGhpcy5pbmRleE1hcCh0b2tlbnMpO1xuICAgICAgfVxuXG4gICAgICAvLyBJZiBjdXJzb3IgaGFzIG1vdmVkIGZvcndhcmQsIHRoZW4gdGV4dCB3YXMgYWRkZWQuXG4gICAgICBpZiAocG9zID4gcHJldlBvcykge1xuICAgICAgICB2YXIgYWRkZWRUZXh0ID0gbm9kZS52YWx1ZS5zdWJzdHJpbmcocHJldlBvcywgcG9zKTtcbiAgICAgICAgLy8gSW5zZXJ0IHRoZSB0ZXh0IGludG8gdGhlIHRva2Vucy5cbiAgICAgICAgdG9rZW5zLnNwbGljZShwcmV2VG9rZW5JbmRleCwgMCwgYWRkZWRUZXh0KTtcbiAgICAgIC8vIElmIGN1cnNvciBoYXMgbW92ZWQgYmFja3dhcmQsIHRoZW4gd2UgZGVsZXRlZCAoYmFja3NwYWNlZCkgdGV4dFxuICAgICAgfSBpZiAocG9zIDwgcHJldlBvcykge1xuICAgICAgICB2YXIgdG9rZW4gPSB0aGlzLnRva2VuQXQocG9zKTtcbiAgICAgICAgdmFyIHRva2VuQmVmb3JlID0gdGhpcy50b2tlbkJlZm9yZShwb3MpO1xuICAgICAgICAvLyBJZiB3ZSBtb3ZlZCBiYWNrIG9udG8gYSB0b2tlbiwgdGhlbiB3ZSBzaG91bGQgbW92ZSBiYWNrIHRvIGJlZ2lubmluZ1xuICAgICAgICAvLyBvZiB0b2tlbi5cbiAgICAgICAgaWYgKHRva2VuID09PSB0b2tlbkJlZm9yZSkge1xuICAgICAgICAgIHBvcyA9IHRoaXMubW92ZU9mZlRhZyhwb3MsIHRva2VucywgdGhpcy5pbmRleE1hcCh0b2tlbnMpLCAtMSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHRva2VuSW5kZXggPSB0aGlzLnRva2VuSW5kZXgocG9zLCB0b2tlbnMsIHRoaXMudHJhY2tpbmcuaW5kZXhNYXApO1xuICAgICAgICAvLyBOb3cgd2UgY2FuIHJlbW92ZSB0aGUgdG9rZW5zIHRoYXQgd2VyZSBkZWxldGVkLlxuICAgICAgICB0b2tlbnMuc3BsaWNlKHRva2VuSW5kZXgsIHByZXZUb2tlbkluZGV4IC0gdG9rZW5JbmRleCk7XG4gICAgICB9XG5cbiAgICAgIC8vIENvbnZlcnQgdG9rZW5zIGJhY2sgaW50byByYXcgdmFsdWUgd2l0aCB0YWdzLiBOZXdseSBmb3JtZWQgdGFncyB3aWxsXG4gICAgICAvLyBiZWNvbWUgcGFydCBvZiB0aGUgcmF3IHZhbHVlLlxuICAgICAgdmFyIHJhd1ZhbHVlID0gdGhpcy5yYXdWYWx1ZSh0b2tlbnMpO1xuXG4gICAgICB0aGlzLnRyYWNraW5nLnBvcyA9IHBvcztcbiAgICAgIHRoaXMudHJhY2tpbmcucmFuZ2UgPSAwO1xuXG4gICAgICAvLyBTZXQgdGhlIHZhbHVlIHRvIHRoZSBuZXcgcmF3IHZhbHVlLlxuICAgICAgdGhpcy5wcm9wcy5maWVsZC52YWwocmF3VmFsdWUpO1xuXG4gICAgICB0aGlzLnNuYXBzaG90KCk7XG4gICAgfSxcblxuICAgIGNvbXBvbmVudERpZFVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHZhbHVlID0gdGhpcy5wcm9wcy5maWVsZC52YWx1ZSB8fCAnJztcbiAgICAgIHZhciBwYXJ0cyA9IHV0aWwucGFyc2VUZXh0V2l0aFRhZ3ModmFsdWUpO1xuICAgICAgdGhpcy50cmFja2luZy50b2tlbnMgPSB0aGlzLnRva2VucyhwYXJ0cyk7XG4gICAgICB0aGlzLnRyYWNraW5nLmluZGV4TWFwID0gdGhpcy5pbmRleE1hcCh0aGlzLnRyYWNraW5nLnRva2Vucyk7XG5cbiAgICAgIHZhciBwb3MgPSB0aGlzLm5vcm1hbGl6ZVBvc2l0aW9uKHRoaXMudHJhY2tpbmcucG9zKTtcbiAgICAgIHZhciByYW5nZSA9IHRoaXMudHJhY2tpbmcucmFuZ2U7XG4gICAgICB2YXIgZW5kUG9zID0gdGhpcy5ub3JtYWxpemVQb3NpdGlvbihwb3MgKyByYW5nZSk7XG4gICAgICByYW5nZSA9IGVuZFBvcyAtIHBvcztcblxuICAgICAgdGhpcy50cmFja2luZy5wb3MgPSBwb3M7XG4gICAgICB0aGlzLnRyYWNraW5nLnJhbmdlID0gcmFuZ2U7XG5cbiAgICAgIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLnJlZnMuY29udGVudC5nZXRET01Ob2RlKCkpIHtcbiAgICAgICAgLy8gUmVhY3QgY2FuIGxvc2UgdGhlIHNlbGVjdGlvbiwgc28gcHV0IGl0IGJhY2suXG4gICAgICAgIHRoaXMucmVmcy5jb250ZW50LmdldERPTU5vZGUoKS5zZXRTZWxlY3Rpb25SYW5nZShwb3MsIHBvcyArIHJhbmdlKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gR2V0IHRoZSBsYWJlbCBmb3IgYSBrZXkuXG4gICAgcHJldHR5TGFiZWw6IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIGlmICh0aGlzLnByb3BzLmZpZWxkLmRlZi5yZXBsYWNlQ2hvaWNlc0xhYmVsc1trZXldKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnByb3BzLmZpZWxkLmRlZi5yZXBsYWNlQ2hvaWNlc0xhYmVsc1trZXldO1xuICAgICAgfVxuICAgICAgdmFyIGNsZWFuZWQgPSByZW1vdmVJZFByZWZpeChrZXkpO1xuICAgICAgcmV0dXJuIHV0aWwuaHVtYW5pemUoY2xlYW5lZCk7XG4gICAgfSxcblxuICAgIC8vIEdpdmVuIHRoZSBhY3R1YWwgdmFsdWUgb2YgdGhlIGZpZWxkICh3aXRoIHRhZ3MpLCBnZXQgdGhlIHBsYWluIHRleHQgdGhhdFxuICAgIC8vIHNob3VsZCBzaG93IGluIHRoZSB0ZXh0YXJlYS5cbiAgICBwbGFpblZhbHVlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIHZhciBwYXJ0cyA9IHV0aWwucGFyc2VUZXh0V2l0aFRhZ3ModmFsdWUpO1xuICAgICAgcmV0dXJuIHBhcnRzLm1hcChmdW5jdGlvbiAocGFydCkge1xuICAgICAgICBpZiAocGFydC50eXBlID09PSAndGV4dCcpIHtcbiAgICAgICAgICByZXR1cm4gcGFydC52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gTEVGVF9QQUQgKyBub0JyZWFrKHRoaXMucHJldHR5TGFiZWwocGFydC52YWx1ZSkpICsgUklHSFRfUEFEO1xuICAgICAgICB9XG4gICAgICB9LmJpbmQodGhpcykpLmpvaW4oJycpO1xuICAgIH0sXG5cbiAgICAvLyBHaXZlbiB0aGUgYWN0dWFsIHZhbHVlIG9mIHRoZSBmaWVsZCAod2l0aCB0YWdzKSwgZ2V0IHRoZSBodG1sIHVzZWQgdG9cbiAgICAvLyBoaWdobGlnaHQgdGhlIGxhYmVscy5cbiAgICBwcmV0dHlWYWx1ZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICB2YXIgcGFydHMgPSB1dGlsLnBhcnNlVGV4dFdpdGhUYWdzKHZhbHVlKTtcbiAgICAgIHJldHVybiBwYXJ0cy5tYXAoZnVuY3Rpb24gKHBhcnQsIGkpIHtcbiAgICAgICAgaWYgKHBhcnQudHlwZSA9PT0gJ3RleHQnKSB7XG4gICAgICAgICAgaWYgKGkgPT09IChwYXJ0cy5sZW5ndGggLSAxKSkge1xuICAgICAgICAgICAgaWYgKHBhcnQudmFsdWVbcGFydC52YWx1ZS5sZW5ndGggLSAxXSA9PT0gJ1xcbicpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHBhcnQudmFsdWUgKyAnXFx1MDBhMCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBwYXJ0LnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE1ha2UgYSBwaWxsXG4gICAgICAgICAgdmFyIHBpbGxSZWYgPSAncHJldHR5UGFydCcgKyBpO1xuICAgICAgICAgIHZhciBjbGFzc05hbWUgPSAncHJldHR5LXBhcnQnO1xuICAgICAgICAgIGlmICh0aGlzLnN0YXRlLmhvdmVyUGlsbFJlZiAmJiBwaWxsUmVmID09PSB0aGlzLnN0YXRlLmhvdmVyUGlsbFJlZikge1xuICAgICAgICAgICAgY2xhc3NOYW1lICs9ICcgcHJldHR5LXBhcnQtaG92ZXInO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUi5zcGFuKHtrZXk6IGksIGNsYXNzTmFtZTogY2xhc3NOYW1lLCByZWY6IHBpbGxSZWYsICdkYXRhLXByZXR0eSc6IHRydWUsICdkYXRhLXJlZic6IHBpbGxSZWZ9LFxuICAgICAgICAgICAgUi5zcGFuKHtjbGFzc05hbWU6ICdwcmV0dHktcGFydC1sZWZ0J30sIExFRlRfUEFEKSxcbiAgICAgICAgICAgIFIuc3Bhbih7Y2xhc3NOYW1lOiAncHJldHR5LXBhcnQtdGV4dCd9LCBub0JyZWFrKHRoaXMucHJldHR5TGFiZWwocGFydC52YWx1ZSkpKSxcbiAgICAgICAgICAgIFIuc3Bhbih7Y2xhc3NOYW1lOiAncHJldHR5LXBhcnQtcmlnaHQnfSwgUklHSFRfUEFEKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfSxcblxuICAgIC8vIEdpdmVuIHRoZSB0b2tlbnMgZm9yIGEgZmllbGQsIGdldCB0aGUgYWN0dWFsIHZhbHVlIG9mIHRoZSBmaWVsZCAod2l0aFxuICAgIC8vIHRhZ3MpXG4gICAgcmF3VmFsdWU6IGZ1bmN0aW9uICh0b2tlbnMpIHtcbiAgICAgIHJldHVybiB0b2tlbnMubWFwKGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gJ3RhZycpIHtcbiAgICAgICAgICByZXR1cm4gJ3t7JyArIHRva2VuLnZhbHVlICsgJ319JztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgIH0pLmpvaW4oJycpO1xuICAgIH0sXG5cbiAgICAvLyBHaXZlbiBhIHBvc2l0aW9uLCBpZiBpdCdzIG9uIGEgbGFiZWwsIGdldCB0aGUgcG9zaXRpb24gbGVmdCBvciByaWdodCBvZlxuICAgIC8vIHRoZSBsYWJlbCwgYmFzZWQgb24gZGlyZWN0aW9uIGFuZC9vciB3aGljaCBzaWRlIGlzIGNsb3NlclxuICAgIG1vdmVPZmZUYWc6IGZ1bmN0aW9uIChwb3MsIHRva2VucywgaW5kZXhNYXAsIGRpcikge1xuICAgICAgaWYgKHR5cGVvZiBkaXIgPT09ICd1bmRlZmluZWQnIHx8IGRpciA+IDApIHtcbiAgICAgICAgZGlyID0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRpciA9IC0xO1xuICAgICAgfVxuICAgICAgdmFyIHRva2VuO1xuICAgICAgaWYgKGRpciA+IDApIHtcbiAgICAgICAgdG9rZW4gPSB0b2tlbnNbaW5kZXhNYXBbcG9zXV07XG4gICAgICAgIHdoaWxlIChwb3MgPCBpbmRleE1hcC5sZW5ndGggJiYgdG9rZW5zW2luZGV4TWFwW3Bvc11dLnR5cGUgPT09ICd0YWcnICYmIHRva2Vuc1tpbmRleE1hcFtwb3NdXSA9PT0gdG9rZW4pIHtcbiAgICAgICAgICBwb3MrKztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdG9rZW4gPSB0b2tlbnNbaW5kZXhNYXBbcG9zIC0gMV1dO1xuICAgICAgICB3aGlsZSAocG9zID4gMCAmJiB0b2tlbnNbaW5kZXhNYXBbcG9zIC0gMV1dLnR5cGUgPT09ICd0YWcnICYmIHRva2Vuc1tpbmRleE1hcFtwb3MgLSAxXV0gPT09IHRva2VuKSB7XG4gICAgICAgICAgcG9zLS07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHBvcztcbiAgICB9LFxuXG4gICAgLy8gR2V0IHRoZSB0b2tlbiBhdCBzb21lIHBvc2l0aW9uLlxuICAgIHRva2VuQXQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgIGlmIChwb3MgPj0gdGhpcy50cmFja2luZy5pbmRleE1hcC5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAocG9zIDwgMCkge1xuICAgICAgICBwb3MgPSAwO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMudHJhY2tpbmcudG9rZW5zW3RoaXMudHJhY2tpbmcuaW5kZXhNYXBbcG9zXV07XG4gICAgfSxcblxuICAgIC8vIEdldCB0aGUgdG9rZW4gaW1tZWRpYXRlbHkgYmVmb3JlIHNvbWUgcG9zaXRpb24uXG4gICAgdG9rZW5CZWZvcmU6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgIGlmIChwb3MgPj0gdGhpcy50cmFja2luZy5pbmRleE1hcC5sZW5ndGgpIHtcbiAgICAgICAgcG9zID0gdGhpcy50cmFja2luZy5pbmRleE1hcC5sZW5ndGg7XG4gICAgICB9XG4gICAgICBpZiAocG9zIDw9IDApIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy50cmFja2luZy50b2tlbnNbdGhpcy50cmFja2luZy5pbmRleE1hcFtwb3MgLSAxXV07XG4gICAgfSxcblxuICAgIC8vIEdpdmVuIGEgcG9zaXRpb24sIGdldCBhIGNvcnJlY3RlZCBwb3NpdGlvbiAoaWYgbmVjZXNzYXJ5IHRvIGJlXG4gICAgLy8gY29ycmVjdGVkKS5cbiAgICBub3JtYWxpemVQb3NpdGlvbjogZnVuY3Rpb24gKHBvcywgcHJldlBvcykge1xuICAgICAgaWYgKF8uaXNVbmRlZmluZWQocHJldlBvcykpIHtcbiAgICAgICAgcHJldlBvcyA9IHBvcztcbiAgICAgIH1cbiAgICAgIC8vIEF0IHN0YXJ0IG9yIGVuZCwgc28gb2theS5cbiAgICAgIGlmIChwb3MgPD0gMCB8fCBwb3MgPj0gdGhpcy50cmFja2luZy5pbmRleE1hcC5sZW5ndGgpIHtcbiAgICAgICAgaWYgKHBvcyA8IDApIHtcbiAgICAgICAgICBwb3MgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwb3MgPiB0aGlzLnRyYWNraW5nLmluZGV4TWFwLmxlbmd0aCkge1xuICAgICAgICAgIHBvcyA9IHRoaXMudHJhY2tpbmcuaW5kZXhNYXAubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwb3M7XG4gICAgICB9XG5cbiAgICAgIHZhciB0b2tlbiA9IHRoaXMudG9rZW5BdChwb3MpO1xuICAgICAgdmFyIHRva2VuQmVmb3JlID0gdGhpcy50b2tlbkJlZm9yZShwb3MpO1xuXG4gICAgICAvLyBCZXR3ZWVuIHR3byB0b2tlbnMsIHNvIG9rYXkuXG4gICAgICBpZiAodG9rZW4gIT09IHRva2VuQmVmb3JlKSB7XG4gICAgICAgIHJldHVybiBwb3M7XG4gICAgICB9XG5cbiAgICAgIHZhciBwcmV2VG9rZW4gPSB0aGlzLnRva2VuQXQocHJldlBvcyk7XG4gICAgICB2YXIgcHJldlRva2VuQmVmb3JlID0gdGhpcy50b2tlbkJlZm9yZShwcmV2UG9zKTtcblxuICAgICAgdmFyIHJpZ2h0UG9zID0gdGhpcy5tb3ZlT2ZmVGFnKHBvcywgdGhpcy50cmFja2luZy50b2tlbnMsIHRoaXMudHJhY2tpbmcuaW5kZXhNYXApO1xuICAgICAgdmFyIGxlZnRQb3MgPSB0aGlzLm1vdmVPZmZUYWcocG9zLCB0aGlzLnRyYWNraW5nLnRva2VucywgdGhpcy50cmFja2luZy5pbmRleE1hcCwgLTEpO1xuXG4gICAgICBpZiAocHJldlRva2VuICE9PSBwcmV2VG9rZW5CZWZvcmUpIHtcbiAgICAgICAgLy8gTW92ZWQgZnJvbSBsZWZ0IGVkZ2UuXG4gICAgICAgIGlmIChwcmV2VG9rZW4gPT09IHRva2VuKSB7XG4gICAgICAgICAgcmV0dXJuIHJpZ2h0UG9zO1xuICAgICAgICB9XG4gICAgICAgIC8vIE1vdmVkIGZyb20gcmlnaHQgZWRnZS5cbiAgICAgICAgaWYgKHByZXZUb2tlbkJlZm9yZSA9PT0gdG9rZW4pIHtcbiAgICAgICAgICByZXR1cm4gbGVmdFBvcztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgbmV3UG9zID0gcmlnaHRQb3M7XG5cbiAgICAgIGlmIChwb3MgPT09IHByZXZQb3MgfHwgcG9zIDwgcHJldlBvcykge1xuICAgICAgICBpZiAocmlnaHRQb3MgLSBwb3MgPiBwb3MgLSBsZWZ0UG9zKSB7XG4gICAgICAgICAgbmV3UG9zID0gbGVmdFBvcztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG5ld1BvcztcbiAgICB9LFxuXG5cblxuICAgIG9uU2VsZWN0OiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgIHZhciBub2RlID0gZXZlbnQudGFyZ2V0O1xuXG4gICAgICB2YXIgcG9zID0gbm9kZS5zZWxlY3Rpb25TdGFydDtcbiAgICAgIHZhciBlbmRQb3MgPSBub2RlLnNlbGVjdGlvbkVuZDtcblxuICAgICAgaWYgKHBvcyA9PT0gZW5kUG9zICYmIHRoaXMuc3RhdGUuaG92ZXJQaWxsUmVmKSB7XG4gICAgICAgIHZhciB0b2tlbkF0ID0gdGhpcy50b2tlbkF0KHBvcyk7XG4gICAgICAgIHZhciB0b2tlbkJlZm9yZSA9IHRoaXMudG9rZW5CZWZvcmUocG9zKTtcblxuICAgICAgICBpZiAodG9rZW5BdCAmJiB0b2tlbkF0ID09PSB0b2tlbkJlZm9yZSAmJiB0b2tlbkF0LnR5cGUgJiYgdG9rZW5BdC50eXBlID09PSAndGFnJykge1xuICAgICAgICAgIC8vIENsaWNrZWQgYSB0YWcuXG4gICAgICAgICAgdmFyIHJpZ2h0UG9zID0gdGhpcy5tb3ZlT2ZmVGFnKHBvcywgdGhpcy50cmFja2luZy50b2tlbnMsIHRoaXMudHJhY2tpbmcuaW5kZXhNYXApO1xuICAgICAgICAgIHZhciBsZWZ0UG9zID0gdGhpcy5tb3ZlT2ZmVGFnKHBvcywgdGhpcy50cmFja2luZy50b2tlbnMsIHRoaXMudHJhY2tpbmcuaW5kZXhNYXAsIC0xKTtcbiAgICAgICAgICB0aGlzLnRyYWNraW5nLnBvcyA9IGxlZnRQb3M7XG4gICAgICAgICAgdGhpcy50cmFja2luZy5yYW5nZSA9IHJpZ2h0UG9zIC0gbGVmdFBvcztcbiAgICAgICAgICBub2RlLnNlbGVjdGlvblN0YXJ0ID0gbGVmdFBvcztcbiAgICAgICAgICBub2RlLnNlbGVjdGlvbkVuZCA9IHJpZ2h0UG9zO1xuXG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7aXNDaG9pY2VzT3BlbjogdHJ1ZX0pO1xuXG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHBvcyA9IHRoaXMubm9ybWFsaXplUG9zaXRpb24ocG9zLCB0aGlzLnRyYWNraW5nLnBvcyk7XG4gICAgICBlbmRQb3MgPSB0aGlzLm5vcm1hbGl6ZVBvc2l0aW9uKGVuZFBvcywgdGhpcy50cmFja2luZy5wb3MgKyB0aGlzLnRyYWNraW5nLnJhbmdlKTtcblxuICAgICAgdGhpcy50cmFja2luZy5wb3MgPSBwb3M7XG4gICAgICB0aGlzLnRyYWNraW5nLnJhbmdlID0gZW5kUG9zIC0gcG9zO1xuXG4gICAgICBub2RlLnNlbGVjdGlvblN0YXJ0ID0gcG9zO1xuICAgICAgbm9kZS5zZWxlY3Rpb25FbmQgPSBlbmRQb3M7XG4gICAgfSxcblxuICAgIG9uQ29weTogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG5vZGUgPSB0aGlzLnJlZnMuY29udGVudC5nZXRET01Ob2RlKCk7XG4gICAgICB2YXIgc3RhcnQgPSBub2RlLnNlbGVjdGlvblN0YXJ0O1xuICAgICAgdmFyIGVuZCA9IG5vZGUuc2VsZWN0aW9uRW5kO1xuICAgICAgdmFyIHRleHQgPSBub2RlLnZhbHVlLnN1YnN0cmluZyhzdGFydCwgZW5kKTtcbiAgICAgIHZhciByZWFsU3RhcnRJbmRleCA9IHRoaXMudG9rZW5JbmRleChzdGFydCwgdGhpcy50cmFja2luZy50b2tlbnMsIHRoaXMudHJhY2tpbmcuaW5kZXhNYXApO1xuICAgICAgdmFyIHJlYWxFbmRJbmRleCA9IHRoaXMudG9rZW5JbmRleChlbmQsIHRoaXMudHJhY2tpbmcudG9rZW5zLCB0aGlzLnRyYWNraW5nLmluZGV4TWFwKTtcbiAgICAgIHZhciB0b2tlbnMgPSB0aGlzLnRyYWNraW5nLnRva2Vucy5zbGljZShyZWFsU3RhcnRJbmRleCwgcmVhbEVuZEluZGV4KTtcbiAgICAgIHRleHQgPSB0aGlzLnJhd1ZhbHVlKHRva2Vucyk7XG4gICAgICB2YXIgb3JpZ2luYWxWYWx1ZSA9IG5vZGUudmFsdWU7XG4gICAgICBub2RlLnZhbHVlID0gbm9kZS52YWx1ZSArIHRleHQ7XG4gICAgICBub2RlLnNldFNlbGVjdGlvblJhbmdlKG9yaWdpbmFsVmFsdWUubGVuZ3RoLCBvcmlnaW5hbFZhbHVlLmxlbmd0aCArIHRleHQubGVuZ3RoKTtcbiAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBub2RlLnZhbHVlID0gb3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgbm9kZS5zZXRTZWxlY3Rpb25SYW5nZShzdGFydCwgZW5kKTtcbiAgICAgIH0sMCk7XG4gICAgfSxcblxuICAgIG9uQ3V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbm9kZSA9IHRoaXMucmVmcy5jb250ZW50LmdldERPTU5vZGUoKTtcbiAgICAgIHZhciBzdGFydCA9IG5vZGUuc2VsZWN0aW9uU3RhcnQ7XG4gICAgICB2YXIgZW5kID0gbm9kZS5zZWxlY3Rpb25FbmQ7XG4gICAgICB2YXIgdGV4dCA9IG5vZGUudmFsdWUuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpO1xuICAgICAgdmFyIHJlYWxTdGFydEluZGV4ID0gdGhpcy50b2tlbkluZGV4KHN0YXJ0LCB0aGlzLnRyYWNraW5nLnRva2VucywgdGhpcy50cmFja2luZy5pbmRleE1hcCk7XG4gICAgICB2YXIgcmVhbEVuZEluZGV4ID0gdGhpcy50b2tlbkluZGV4KGVuZCwgdGhpcy50cmFja2luZy50b2tlbnMsIHRoaXMudHJhY2tpbmcuaW5kZXhNYXApO1xuICAgICAgdmFyIHRva2VucyA9IHRoaXMudHJhY2tpbmcudG9rZW5zLnNsaWNlKHJlYWxTdGFydEluZGV4LCByZWFsRW5kSW5kZXgpO1xuICAgICAgdGV4dCA9IHRoaXMucmF3VmFsdWUodG9rZW5zKTtcbiAgICAgIHZhciBvcmlnaW5hbFZhbHVlID0gbm9kZS52YWx1ZTtcbiAgICAgIHZhciBjdXRWYWx1ZSA9IG5vZGUudmFsdWUuc3Vic3RyaW5nKDAsIHN0YXJ0KSArIG5vZGUudmFsdWUuc3Vic3RyaW5nKGVuZCk7XG4gICAgICBub2RlLnZhbHVlID0gbm9kZS52YWx1ZSArIHRleHQ7XG4gICAgICBub2RlLnNldFNlbGVjdGlvblJhbmdlKG9yaWdpbmFsVmFsdWUubGVuZ3RoLCBvcmlnaW5hbFZhbHVlLmxlbmd0aCArIHRleHQubGVuZ3RoKTtcbiAgICAgIHZhciBjdXRUb2tlbnMgPSB0aGlzLnRyYWNraW5nLnRva2Vucy5zbGljZSgwLCByZWFsU3RhcnRJbmRleCkuY29uY2F0KHRoaXMudHJhY2tpbmcudG9rZW5zLnNsaWNlKHJlYWxFbmRJbmRleCkpO1xuICAgICAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIG5vZGUudmFsdWUgPSBjdXRWYWx1ZTtcbiAgICAgICAgbm9kZS5zZXRTZWxlY3Rpb25SYW5nZShzdGFydCwgc3RhcnQpO1xuICAgICAgICB0aGlzLnRyYWNraW5nLnBvcyA9IHN0YXJ0O1xuICAgICAgICB0aGlzLnRyYWNraW5nLnJhbmdlID0gMDtcbiAgICAgICAgdGhpcy50cmFja2luZy50b2tlbnMgPSBjdXRUb2tlbnM7XG4gICAgICAgIHRoaXMudHJhY2tpbmcuaW5kZXhNYXAgPSB0aGlzLmluZGV4TWFwKHRoaXMudHJhY2tpbmcudG9rZW5zKTtcblxuICAgICAgICAvLyBDb252ZXJ0IHRva2VucyBiYWNrIGludG8gcmF3IHZhbHVlIHdpdGggdGFncy4gTmV3bHkgZm9ybWVkIHRhZ3Mgd2lsbFxuICAgICAgICAvLyBiZWNvbWUgcGFydCBvZiB0aGUgcmF3IHZhbHVlLlxuICAgICAgICB2YXIgcmF3VmFsdWUgPSB0aGlzLnJhd1ZhbHVlKHRoaXMudHJhY2tpbmcudG9rZW5zKTtcblxuICAgICAgICAvLyBTZXQgdGhlIHZhbHVlIHRvIHRoZSBuZXcgcmF3IHZhbHVlLlxuICAgICAgICB0aGlzLnByb3BzLmZpZWxkLnZhbChyYXdWYWx1ZSk7XG5cbiAgICAgICAgdGhpcy5zbmFwc2hvdCgpO1xuICAgICAgfS5iaW5kKHRoaXMpLDApO1xuICAgIH0sXG5cbiAgICBvbktleURvd246IGZ1bmN0aW9uIChldmVudCkge1xuXG4gICAgICBpZiAoZXZlbnQua2V5Q29kZSA9PT0gMzcpIHtcbiAgICAgICAgdGhpcy5sZWZ0QXJyb3dEb3duID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gMzkpIHtcbiAgICAgICAgdGhpcy5yaWdodEFycm93RG93biA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vIENtZC1aIG9yIEN0cmwtWlxuICAgICAgaWYgKGV2ZW50LmtleUNvZGUgPT09IDkwICYmIChldmVudC5tZXRhS2V5IHx8IGV2ZW50LmN0cmxLZXkpICYmICFldmVudC5zaGlmdEtleSkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB0aGlzLnVuZG8oKTtcbiAgICAgIC8vIENtZC1TaGlmdC1aIG9yIEN0cmwtWVxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgKGV2ZW50LmtleUNvZGUgPT09IDg5ICYmIGV2ZW50LmN0cmxLZXkgJiYgIWV2ZW50LnNoaWZ0S2V5KSB8fFxuICAgICAgICAoZXZlbnQua2V5Q29kZSA9PT0gOTAgJiYgZXZlbnQubWV0YUtleSAmJiBldmVudC5zaGlmdEtleSlcbiAgICAgICkge1xuICAgICAgICB0aGlzLnJlZG8oKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgb25LZXlVcDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICBpZiAoZXZlbnQua2V5Q29kZSA9PT0gMzcpIHtcbiAgICAgICAgdGhpcy5sZWZ0QXJyb3dEb3duID0gZmFsc2U7XG4gICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IDM5KSB7XG4gICAgICAgIHRoaXMucmlnaHRBcnJvd0Rvd24gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gS2VlcCB0aGUgaGlnaGxpZ2h0IHN0eWxlcyBpbiBzeW5jIHdpdGggdGhlIHRleHRhcmVhIHN0eWxlcy5cbiAgICBhZGp1c3RTdHlsZXM6IGZ1bmN0aW9uIChpc01vdW50KSB7XG4gICAgICB2YXIgb3ZlcmxheSA9IHRoaXMucmVmcy5oaWdobGlnaHQuZ2V0RE9NTm9kZSgpO1xuICAgICAgdmFyIGNvbnRlbnQgPSB0aGlzLnJlZnMuY29udGVudC5nZXRET01Ob2RlKCk7XG5cbiAgICAgIHZhciBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGNvbnRlbnQpO1xuXG4gICAgICB2YXIgYmFja2dyb3VuZENvbG9yID0gc3R5bGUuYmFja2dyb3VuZENvbG9yO1xuXG4gICAgICB1dGlsLmNvcHlFbGVtZW50U3R5bGUoY29udGVudCwgb3ZlcmxheSk7XG5cbiAgICAgIG92ZXJsYXkuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgICAgb3ZlcmxheS5zdHlsZS53aGl0ZVNwYWNlID0gJ3ByZS13cmFwJztcbiAgICAgIG92ZXJsYXkuc3R5bGUuY29sb3IgPSAncmdiYSgwLDAsMCwwKSc7XG4gICAgICBvdmVybGF5LnN0eWxlLndlYmtpdFRleHRGaWxsQ29sb3IgPSAncmdiYSgwLDAsMCwwKSc7XG4gICAgICBvdmVybGF5LnN0eWxlLnJlc2l6ZSA9ICdub25lJztcbiAgICAgIG92ZXJsYXkuc3R5bGUuYm9yZGVyQ29sb3IgPSAncmdiYSgwLDAsMCwwKSc7XG5cbiAgICAgIGlmICh1dGlsLmJyb3dzZXIuaXNNb3ppbGxhKSB7XG5cbiAgICAgICAgdmFyIHBhZGRpbmdUb3AgPSBwYXJzZUZsb2F0KHN0eWxlLnBhZGRpbmdUb3ApO1xuICAgICAgICB2YXIgcGFkZGluZ0JvdHRvbSA9IHBhcnNlRmxvYXQoc3R5bGUucGFkZGluZ0JvdHRvbSk7XG5cbiAgICAgICAgdmFyIGJvcmRlclRvcCA9IHBhcnNlRmxvYXQoc3R5bGUuYm9yZGVyVG9wV2lkdGgpO1xuICAgICAgICB2YXIgYm9yZGVyQm90dG9tID0gcGFyc2VGbG9hdChzdHlsZS5ib3JkZXJCb3R0b21XaWR0aCk7XG5cbiAgICAgICAgb3ZlcmxheS5zdHlsZS5wYWRkaW5nVG9wID0gJzBweCc7XG4gICAgICAgIG92ZXJsYXkuc3R5bGUucGFkZGluZ0JvdHRvbSA9ICcwcHgnO1xuXG4gICAgICAgIG92ZXJsYXkuc3R5bGUuaGVpZ2h0ID0gKGNvbnRlbnQuY2xpZW50SGVpZ2h0IC0gcGFkZGluZ1RvcCAtIHBhZGRpbmdCb3R0b20gKyBib3JkZXJUb3AgKyBib3JkZXJCb3R0b20pICsgJ3B4JztcbiAgICAgICAgb3ZlcmxheS5zdHlsZS50b3AgPSBzdHlsZS5wYWRkaW5nVG9wO1xuICAgICAgICBvdmVybGF5LnN0eWxlLmJveFNoYWRvdyA9ICdub25lJztcbiAgICAgIH1cblxuICAgICAgaWYgKGlzTW91bnQpIHtcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kQ29sb3IgPSBiYWNrZ3JvdW5kQ29sb3I7XG4gICAgICB9XG4gICAgICBvdmVybGF5LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuYmFja2dyb3VuZENvbG9yO1xuICAgICAgY29udGVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAncmdiYSgwLDAsMCwwKSc7XG4gICAgfSxcblxuICAgIC8vIElmIHRoZSB0ZXh0YXJlYSBpcyByZXNpemVkLCBuZWVkIHRvIHJlLXN5bmMgdGhlIHN0eWxlcy5cbiAgICBvblJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5hZGp1c3RTdHlsZXMoKTtcbiAgICB9LFxuXG4gICAgLy8gSWYgdGhlIHdpbmRvdyBpcyByZXNpemVkLCBtYXkgbmVlZCB0byByZS1zeW5jIHRoZSBzdHlsZXMuXG4gICAgLy8gUHJvYmFibHkgbm90IG5lY2Vzc2FyeSB3aXRoIGVsZW1lbnQgcmVzaXplP1xuICAgIG9uUmVzaXplV2luZG93OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmFkanVzdFN0eWxlcygpO1xuICAgIH0sXG5cbiAgICBjb21wb25lbnREaWRNb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5hZGp1c3RTdHlsZXModHJ1ZSk7XG4gICAgICB0aGlzLnNldE9uUmVzaXplKCdjb250ZW50JywgdGhpcy5vblJlc2l6ZSk7XG4gICAgICAvL3RoaXMuc2V0T25DbGlja091dHNpZGUoJ2Nob2ljZXMnLCB0aGlzLm9uQ2xpY2tPdXRzaWRlQ2hvaWNlcyk7XG4gICAgfSxcblxuICAgIG9uSW5zZXJ0RnJvbVNlbGVjdDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICBpZiAoZXZlbnQudGFyZ2V0LnNlbGVjdGVkSW5kZXggPiAwKSB7XG4gICAgICAgIHZhciB0YWcgPSBldmVudC50YXJnZXQudmFsdWU7XG4gICAgICAgIGV2ZW50LnRhcmdldC5zZWxlY3RlZEluZGV4ID0gMDtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMudHJhY2tpbmcucG9zO1xuICAgICAgICB2YXIgaW5zZXJ0UG9zID0gdGhpcy5ub3JtYWxpemVQb3NpdGlvbihwb3MpO1xuICAgICAgICB2YXIgdG9rZW5zID0gdGhpcy50cmFja2luZy50b2tlbnM7XG4gICAgICAgIHZhciB0b2tlbkluZGV4ID0gdGhpcy50b2tlbkluZGV4KGluc2VydFBvcywgdG9rZW5zLCB0aGlzLnRyYWNraW5nLmluZGV4TWFwKTtcbiAgICAgICAgdG9rZW5zLnNwbGljZSh0b2tlbkluZGV4LCAwLCB7XG4gICAgICAgICAgdHlwZTogJ3RhZycsXG4gICAgICAgICAgdmFsdWU6IHRhZ1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50cmFja2luZy5pbmRleE1hcCA9IHRoaXMuaW5kZXhNYXAodG9rZW5zKTtcbiAgICAgICAgdmFyIG5ld1ZhbHVlID0gdGhpcy5yYXdWYWx1ZSh0b2tlbnMpO1xuICAgICAgICB0aGlzLnRyYWNraW5nLnBvcyArPSB0aGlzLnByZXR0eUxhYmVsKHRhZykubGVuZ3RoO1xuICAgICAgICB0aGlzLnByb3BzLmZpZWxkLnZhbChuZXdWYWx1ZSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIG9uSW5zZXJ0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIHZhciB0YWcgPSB2YWx1ZTtcbiAgICAgIHZhciBwb3MgPSB0aGlzLnRyYWNraW5nLnBvcztcbiAgICAgIHZhciBlbmRQb3MgPSB0aGlzLnRyYWNraW5nLnBvcyArIHRoaXMudHJhY2tpbmcucmFuZ2U7XG4gICAgICB2YXIgaW5zZXJ0UG9zID0gdGhpcy5ub3JtYWxpemVQb3NpdGlvbihwb3MpO1xuICAgICAgdmFyIGVuZEluc2VydFBvcyA9IHRoaXMubm9ybWFsaXplUG9zaXRpb24oZW5kUG9zKTtcbiAgICAgIHZhciB0b2tlbnMgPSB0aGlzLnRyYWNraW5nLnRva2VucztcbiAgICAgIHZhciB0b2tlbkluZGV4ID0gdGhpcy50b2tlbkluZGV4KGluc2VydFBvcywgdG9rZW5zLCB0aGlzLnRyYWNraW5nLmluZGV4TWFwKTtcbiAgICAgIHZhciB0b2tlbkVuZEluZGV4ID0gdGhpcy50b2tlbkluZGV4KGVuZEluc2VydFBvcywgdG9rZW5zLCB0aGlzLnRyYWNraW5nLmluZGV4TWFwKTtcbiAgICAgIHRva2Vucy5zcGxpY2UodG9rZW5JbmRleCwgdG9rZW5FbmRJbmRleCAtIHRva2VuSW5kZXgsIHtcbiAgICAgICAgdHlwZTogJ3RhZycsXG4gICAgICAgIHZhbHVlOiB0YWdcbiAgICAgIH0pO1xuICAgICAgdGhpcy50cmFja2luZy5pbmRleE1hcCA9IHRoaXMuaW5kZXhNYXAodG9rZW5zKTtcbiAgICAgIHZhciBuZXdWYWx1ZSA9IHRoaXMucmF3VmFsdWUodG9rZW5zKTtcbiAgICAgIHRoaXMudHJhY2tpbmcucG9zICs9IHRoaXMucHJldHR5TGFiZWwodGFnKS5sZW5ndGg7XG4gICAgICB0aGlzLnByb3BzLmZpZWxkLnZhbChuZXdWYWx1ZSk7XG4gICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgaXNDaG9pY2VzT3BlbjogZmFsc2VcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBvblRvZ2dsZUNob2ljZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICBpc0Nob2ljZXNPcGVuOiAhdGhpcy5zdGF0ZS5pc0Nob2ljZXNPcGVuXG4gICAgICB9KTtcbiAgICB9LFxuXG4gICAgb25DbG9zZUNob2ljZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICBpc0Nob2ljZXNPcGVuOiBmYWxzZVxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIGdldENsb3NlSWdub3JlTm9kZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlZnMudG9nZ2xlLmdldERPTU5vZGUoKTtcbiAgICB9LFxuXG4gICAgb25DbGlja091dHNpZGVDaG9pY2VzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyAvLyBJZiB3ZSBkaWRuJ3QgY2xpY2sgb24gdGhlIHRvZ2dsZSBidXR0b24sIGNsb3NlIHRoZSBjaG9pY2VzLlxuICAgICAgLy8gaWYgKHRoaXMuaXNOb2RlT3V0c2lkZSh0aGlzLnJlZnMudG9nZ2xlLmdldERPTU5vZGUoKSwgZXZlbnQudGFyZ2V0KSkge1xuICAgICAgLy8gICBjb25zb2xlLmxvZygnbm90IGEgdG9nZ2xlIGNsaWNrJylcbiAgICAgIC8vICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAvLyAgICAgaXNDaG9pY2VzT3BlbjogZmFsc2VcbiAgICAgIC8vICAgfSk7XG4gICAgICAvLyB9XG4gICAgfSxcblxuICAgIG9uTW91c2VNb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgIC8vIFBsYWNlaG9sZGVyIHRvIGdldCBhdCBwaWxsIHVuZGVyIG1vdXNlIHBvc2l0aW9uLiBJbmVmZmljaWVudCwgYnV0IG5vdFxuICAgICAgLy8gc3VyZSB0aGVyZSdzIGFub3RoZXIgd2F5LlxuXG4gICAgICB2YXIgcG9zaXRpb24gPSB7eDogZXZlbnQuY2xpZW50WCwgeTogZXZlbnQuY2xpZW50WX07XG4gICAgICB2YXIgbm9kZXMgPSB0aGlzLnJlZnMuaGlnaGxpZ2h0LmdldERPTU5vZGUoKS5jaGlsZE5vZGVzO1xuICAgICAgdmFyIG1hdGNoZWROb2RlID0gbnVsbDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIG5vZGUgPSBub2Rlc1tpXTtcbiAgICAgICAgaWYgKG5vZGVzW2ldLmdldEF0dHJpYnV0ZSgnZGF0YS1wcmV0dHknKSkge1xuICAgICAgICAgIGlmIChwb3NpdGlvbkluTm9kZShwb3NpdGlvbiwgbm9kZSkpIHtcbiAgICAgICAgICAgIG1hdGNoZWROb2RlID0gbm9kZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAobWF0Y2hlZE5vZGUpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUuaG92ZXJQaWxsUmVmICE9PSBtYXRjaGVkTm9kZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJykpIHtcbiAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgIGhvdmVyUGlsbFJlZjogbWF0Y2hlZE5vZGUuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZS5ob3ZlclBpbGxSZWYpIHtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgaG92ZXJQaWxsUmVmOiBudWxsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZCA9IHRoaXMucHJvcHMuZmllbGQ7XG5cbiAgICAgIHZhciByZXBsYWNlQ2hvaWNlcyA9IGZpZWxkLmRlZi5yZXBsYWNlQ2hvaWNlcztcblxuICAgICAgLy8gdmFyIHNlbGVjdFJlcGxhY2VDaG9pY2VzID0gW3tcbiAgICAgIC8vICAgdmFsdWU6ICcnLFxuICAgICAgLy8gICBsYWJlbDogJ0luc2VydC4uLidcbiAgICAgIC8vIH1dLmNvbmNhdChyZXBsYWNlQ2hvaWNlcyk7XG5cbiAgICAgIHJldHVybiBwbHVnaW4uY29tcG9uZW50KCdmaWVsZCcpKHtcbiAgICAgICAgZmllbGQ6IGZpZWxkLCBwbGFpbjogdGhpcy5wcm9wcy5wbGFpblxuICAgICAgfSwgUi5kaXYoe3N0eWxlOiB7cG9zaXRpb246ICdyZWxhdGl2ZSd9fSxcblxuICAgICAgICBSLnByZSh7XG4gICAgICAgICAgY2xhc3NOYW1lOiAncHJldHR5LWhpZ2hsaWdodCcsXG4gICAgICAgICAgcmVmOiAnaGlnaGxpZ2h0J1xuICAgICAgICB9LFxuICAgICAgICAgIHRoaXMucHJldHR5VmFsdWUoZmllbGQudmFsdWUpXG4gICAgICAgICksXG5cbiAgICAgICAgUi50ZXh0YXJlYShfLmV4dGVuZCh7XG4gICAgICAgICAgY2xhc3NOYW1lOiB1dGlsLmNsYXNzTmFtZSh0aGlzLnByb3BzLmNsYXNzTmFtZSwgJ3ByZXR0eS1jb250ZW50JyksXG4gICAgICAgICAgcmVmOiAnY29udGVudCcsXG4gICAgICAgICAgcm93czogZmllbGQuZGVmLnJvd3MgfHwgdGhpcy5wcm9wcy5yb3dzLFxuICAgICAgICAgIG5hbWU6IGZpZWxkLmtleSxcbiAgICAgICAgICB2YWx1ZTogdGhpcy5wbGFpblZhbHVlKGZpZWxkLnZhbHVlKSxcbiAgICAgICAgICBvbkNoYW5nZTogdGhpcy5vbkNoYW5nZSxcbiAgICAgICAgICBvblNjcm9sbDogdGhpcy5vblNjcm9sbCxcbiAgICAgICAgICBzdHlsZToge1xuICAgICAgICAgICAgcG9zaXRpb246ICdyZWxhdGl2ZScsXG4gICAgICAgICAgICB0b3A6IDAsXG4gICAgICAgICAgICBsZWZ0OiAwLFxuICAgICAgICAgICAgY3Vyc29yOiB0aGlzLnN0YXRlLmhvdmVyUGlsbFJlZiA/ICdwb2ludGVyJyA6IG51bGxcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9uS2V5UHJlc3M6IHRoaXMub25LZXlQcmVzcyxcbiAgICAgICAgICBvbktleURvd246IHRoaXMub25LZXlEb3duLFxuICAgICAgICAgIG9uS2V5VXA6IHRoaXMub25LZXlVcCxcbiAgICAgICAgICBvblNlbGVjdDogdGhpcy5vblNlbGVjdCxcbiAgICAgICAgICBvbkNvcHk6IHRoaXMub25Db3B5LFxuICAgICAgICAgIG9uQ3V0OiB0aGlzLm9uQ3V0LFxuICAgICAgICAgIG9uTW91c2VNb3ZlOiB0aGlzLm9uTW91c2VNb3ZlLFxuICAgICAgICAgIG9uRm9jdXM6IHRoaXMub25Gb2N1cyxcbiAgICAgICAgICBvbkJsdXI6IHRoaXMub25CbHVyXG4gICAgICAgIH0sIHBsdWdpbi5jb25maWcuYXR0cmlidXRlcykpLFxuXG4gICAgICAgIFIuYSh7cmVmOiAndG9nZ2xlJywgaHJlZjogJ0phdmFTY3JpcHQnICsgJzonLCBvbkNsaWNrOiB0aGlzLm9uVG9nZ2xlQ2hvaWNlc30sICdJbnNlcnQuLi4nKSxcblxuICAgICAgICBwbHVnaW4uY29tcG9uZW50KCdjaG9pY2VzJykoe1xuICAgICAgICAgIHJlZjogJ2Nob2ljZXMnLFxuICAgICAgICAgIGNob2ljZXM6IHJlcGxhY2VDaG9pY2VzLCBvcGVuOiB0aGlzLnN0YXRlLmlzQ2hvaWNlc09wZW4sXG4gICAgICAgICAgb25TZWxlY3Q6IHRoaXMub25JbnNlcnQsIG9uQ2xvc2U6IHRoaXMub25DbG9zZUNob2ljZXMsIGlnbm9yZUNsb3NlTm9kZXM6IHRoaXMuZ2V0Q2xvc2VJZ25vcmVOb2Rlc30pXG4gICAgICAgIC8vLFxuXG4gICAgICAgIC8vIFIuc2VsZWN0KHtvbkNoYW5nZTogdGhpcy5vbkluc2VydEZyb21TZWxlY3R9LFxuICAgICAgICAvLyAgIHNlbGVjdFJlcGxhY2VDaG9pY2VzLm1hcChmdW5jdGlvbiAoY2hvaWNlLCBpKSB7XG4gICAgICAgIC8vICAgICByZXR1cm4gUi5vcHRpb24oe1xuICAgICAgICAvLyAgICAgICBrZXk6IGksXG4gICAgICAgIC8vICAgICAgIHZhbHVlOiBjaG9pY2UudmFsdWVcbiAgICAgICAgLy8gICAgIH0sIGNob2ljZS5sYWJlbCk7XG4gICAgICAgIC8vICAgfSlcbiAgICAgICAgLy8gKVxuICAgICAgKSk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50LnJlbW92ZS1pdGVtXG5cbi8qXG5SZW1vdmUgYW4gaXRlbS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWUsXG4gICAgICAgIGxhYmVsOiBwbHVnaW4uY29uZmlnVmFsdWUoJ2xhYmVsJywgJ1tyZW1vdmVdJylcbiAgICAgIH07XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFIuc3Bhbih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZSwgb25DbGljazogdGhpcy5wcm9wcy5vbkNsaWNrfSwgdGhpcy5wcm9wcy5sYWJlbCk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50LnJvb3RcblxuLypcblJvb3QgY29tcG9uZW50IGp1c3QgdXNlZCB0byBzcGl0IG91dCBhbGwgdGhlIGZpZWxkcyBmb3IgYSBmb3JtLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogdXRpbC5jbGFzc05hbWUoJ3Jvb3QnLCBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZSlcbiAgICAgIH07XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgcmV0dXJuIFIuZGl2KHtcbiAgICAgICAgY2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZVxuICAgICAgfSxcbiAgICAgICAgZmllbGQuZmllbGRzKCkubWFwKGZ1bmN0aW9uIChmaWVsZCwgaSkge1xuICAgICAgICAgIHJldHVybiBmaWVsZC5jb21wb25lbnQoe2tleTogZmllbGQuZGVmLmtleSB8fCBpLCBvbkZvY3VzOiB0aGlzLnByb3BzLm9uRm9jdXMsIG9uQmx1cjogdGhpcy5wcm9wcy5vbkJsdXJ9KTtcbiAgICAgICAgfS5iaW5kKHRoaXMpKVxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQuaGVscFxuXG4vKlxuSnVzdCB0aGUgaGVscCB0ZXh0IGJsb2NrLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIHZhciBjaG9pY2UgPSB0aGlzLnByb3BzLmNob2ljZTtcblxuICAgICAgcmV0dXJuIGNob2ljZS5zYW1wbGUgP1xuICAgICAgICBSLmRpdih7Y2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZX0sXG4gICAgICAgICAgY2hvaWNlLnNhbXBsZVxuICAgICAgICApIDpcbiAgICAgICAgUi5zcGFuKG51bGwpO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBvbmVudC5zZWxlY3RcblxuLypcblJlbmRlciBzZWxlY3QgZWxlbWVudCB0byBnaXZlIGEgdXNlciBjaG9pY2VzIGZvciB0aGUgdmFsdWUgb2YgYSBmaWVsZC4gTm90ZVxuaXQgc2hvdWxkIHN1cHBvcnQgdmFsdWVzIG90aGVyIHRoYW4gc3RyaW5ncy4gQ3VycmVudGx5IHRoaXMgaXMgb25seSB0ZXN0ZWQgZm9yXG5ib29sZWFuIHZhbHVlcywgYnV0IGl0IF9zaG91bGRfIHdvcmsgZm9yIG90aGVyIHZhbHVlcy5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIG1peGluczogW3BsdWdpbi5yZXF1aXJlKCdtaXhpbi5maWVsZCcpXSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgb25DaGFuZ2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgdmFyIGNob2ljZVZhbHVlID0gZXZlbnQudGFyZ2V0LnZhbHVlO1xuICAgICAgdmFyIGNob2ljZVR5cGUgPSBjaG9pY2VWYWx1ZS5zdWJzdHJpbmcoMCwgY2hvaWNlVmFsdWUuaW5kZXhPZignOicpKTtcbiAgICAgIGlmIChjaG9pY2VUeXBlID09PSAnY2hvaWNlJykge1xuICAgICAgICB2YXIgY2hvaWNlSW5kZXggPSBjaG9pY2VWYWx1ZS5zdWJzdHJpbmcoY2hvaWNlVmFsdWUuaW5kZXhPZignOicpICsgMSk7XG4gICAgICAgIGNob2ljZUluZGV4ID0gcGFyc2VJbnQoY2hvaWNlSW5kZXgpO1xuICAgICAgICB0aGlzLnByb3BzLmZpZWxkLnZhbCh0aGlzLnByb3BzLmZpZWxkLmRlZi5jaG9pY2VzW2Nob2ljZUluZGV4XS52YWx1ZSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuXG4gICAgICB2YXIgZmllbGQgPSB0aGlzLnByb3BzLmZpZWxkO1xuICAgICAgdmFyIGNob2ljZXMgPSBmaWVsZC5kZWYuY2hvaWNlcyB8fCBbXTtcblxuICAgICAgdmFyIGNob2ljZXNPckxvYWRpbmc7XG5cbiAgICAgIGlmIChjaG9pY2VzLmxlbmd0aCA9PT0gMSAmJiBjaG9pY2VzWzBdLnZhbHVlID09PSAnLy8vbG9hZGluZy8vLycpIHtcbiAgICAgICAgY2hvaWNlc09yTG9hZGluZyA9IFIuZGl2KHt9LFxuICAgICAgICAgICdMb2FkaW5nIGNob2ljZXMuLi4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIHZhciB2YWx1ZSA9IGZpZWxkLnZhbHVlICE9PSB1bmRlZmluZWQgPyBmaWVsZC52YWx1ZSA6ICcnO1xuXG4gICAgICAgIGNob2ljZXMgPSBjaG9pY2VzLm1hcChmdW5jdGlvbiAoY2hvaWNlLCBpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNob2ljZVZhbHVlOiAnY2hvaWNlOicgKyBpLFxuICAgICAgICAgICAgdmFsdWU6IGNob2ljZS52YWx1ZSxcbiAgICAgICAgICAgIGxhYmVsOiBjaG9pY2UubGFiZWxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgdmFsdWVDaG9pY2UgPSBfLmZpbmQoY2hvaWNlcywgZnVuY3Rpb24gKGNob2ljZSkge1xuICAgICAgICAgIHJldHVybiBjaG9pY2UudmFsdWUgPT09IHZhbHVlO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAodmFsdWVDaG9pY2UgPT09IHVuZGVmaW5lZCkge1xuXG4gICAgICAgICAgdmFyIGxhYmVsID0gdmFsdWU7XG4gICAgICAgICAgaWYgKCFfLmlzU3RyaW5nKHZhbHVlKSkge1xuICAgICAgICAgICAgbGFiZWwgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbHVlQ2hvaWNlID0ge1xuICAgICAgICAgICAgY2hvaWNlVmFsdWU6ICd2YWx1ZTonLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgbGFiZWw6IGxhYmVsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBjaG9pY2VzID0gW3ZhbHVlQ2hvaWNlXS5jb25jYXQoY2hvaWNlcyk7XG4gICAgICAgIH1cblxuICAgICAgICBjaG9pY2VzT3JMb2FkaW5nID0gUi5zZWxlY3Qoe1xuICAgICAgICAgIGNsYXNzTmFtZTogdGhpcy5wcm9wcy5jbGFzc05hbWUsXG4gICAgICAgICAgb25DaGFuZ2U6IHRoaXMub25DaGFuZ2UsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQ2hvaWNlLmNob2ljZVZhbHVlLFxuICAgICAgICAgIG9uRm9jdXM6IHRoaXMub25Gb2N1cyxcbiAgICAgICAgICBvbkJsdXI6IHRoaXMub25CbHVyXG4gICAgICAgIH0sXG4gICAgICAgICAgY2hvaWNlcy5tYXAoZnVuY3Rpb24gKGNob2ljZSwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIFIub3B0aW9uKHtcbiAgICAgICAgICAgICAga2V5OiBpLFxuICAgICAgICAgICAgICB2YWx1ZTogY2hvaWNlLmNob2ljZVZhbHVlXG4gICAgICAgICAgICB9LCBjaG9pY2UubGFiZWwpO1xuICAgICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHBsdWdpbi5jb21wb25lbnQoJ2ZpZWxkJykoe1xuICAgICAgICBmaWVsZDogZmllbGQsIHBsYWluOiB0aGlzLnByb3BzLnBsYWluXG4gICAgICB9LCBjaG9pY2VzT3JMb2FkaW5nKTtcbiAgICB9XG4gIH0pO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnQudGV4dFxuXG4vKlxuSnVzdCBhIHNpbXBsZSB0ZXh0IGlucHV0LlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IFJlYWN0LmNyZWF0ZUNsYXNzKHtcblxuICAgIGRpc3BsYXlOYW1lOiBwbHVnaW4ubmFtZSxcblxuICAgIG1peGluczogW3BsdWdpbi5yZXF1aXJlKCdtaXhpbi5maWVsZCcpXSxcblxuICAgIGdldERlZmF1bHRQcm9wczogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2xhc3NOYW1lOiBwbHVnaW4uY29uZmlnLmNsYXNzTmFtZVxuICAgICAgfTtcbiAgICB9LFxuXG4gICAgb25DaGFuZ2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgdmFyIG5ld1ZhbHVlID0gZXZlbnQudGFyZ2V0LnZhbHVlO1xuICAgICAgdGhpcy5wcm9wcy5maWVsZC52YWwobmV3VmFsdWUpO1xuICAgIH0sXG5cbiAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgdmFyIGZpZWxkID0gdGhpcy5wcm9wcy5maWVsZDtcblxuICAgICAgcmV0dXJuIHBsdWdpbi5jb21wb25lbnQoJ2ZpZWxkJykoe1xuICAgICAgICBmaWVsZDogZmllbGQsIHBsYWluOiB0aGlzLnByb3BzLnBsYWluXG4gICAgICB9LCBSLmlucHV0KHtcbiAgICAgICAgY2xhc3NOYW1lOiB0aGlzLnByb3BzLmNsYXNzTmFtZSxcbiAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICB2YWx1ZTogZmllbGQudmFsdWUsXG4gICAgICAgIHJvd3M6IGZpZWxkLmRlZi5yb3dzLFxuICAgICAgICBvbkNoYW5nZTogdGhpcy5vbkNoYW5nZSxcbiAgICAgICAgb25Gb2N1czogdGhpcy5vbkZvY3VzLFxuICAgICAgICBvbkJsdXI6IHRoaXMub25CbHVyXG4gICAgICB9KSk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29tcG9uZW50LnRleHRhcmVhXG5cbi8qXG5KdXN0IGEgc2ltcGxlIG11bHRpLXJvdyB0ZXh0YXJlYS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFJlYWN0ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuUmVhY3QgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlJlYWN0IDogbnVsbCk7XG52YXIgUiA9IFJlYWN0LkRPTTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBkaXNwbGF5TmFtZTogcGx1Z2luLm5hbWUsXG5cbiAgICBtaXhpbnM6IFtwbHVnaW4ucmVxdWlyZSgnbWl4aW4uZmllbGQnKV0sXG5cbiAgICBnZXREZWZhdWx0UHJvcHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsYXNzTmFtZTogcGx1Z2luLmNvbmZpZy5jbGFzc05hbWUsXG4gICAgICAgIHJvd3M6IHBsdWdpbi5jb25maWcucm93cyB8fCA1XG4gICAgICB9O1xuICAgIH0sXG5cbiAgICBvbkNoYW5nZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICB2YXIgbmV3VmFsdWUgPSBldmVudC50YXJnZXQudmFsdWU7XG4gICAgICB0aGlzLnByb3BzLmZpZWxkLnZhbChuZXdWYWx1ZSk7XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuXG4gICAgICB2YXIgZmllbGQgPSB0aGlzLnByb3BzLmZpZWxkO1xuXG4gICAgICByZXR1cm4gcGx1Z2luLmNvbXBvbmVudCgnZmllbGQnKSh7XG4gICAgICAgIGZpZWxkOiBmaWVsZCwgcGxhaW46IHRoaXMucHJvcHMucGxhaW5cbiAgICAgIH0sIFIudGV4dGFyZWEoe1xuICAgICAgICBjbGFzc05hbWU6IHRoaXMucHJvcHMuY2xhc3NOYW1lLFxuICAgICAgICB2YWx1ZTogZmllbGQudmFsdWUsXG4gICAgICAgIHJvd3M6IGZpZWxkLmRlZi5yb3dzIHx8IHRoaXMucHJvcHMucm93cyxcbiAgICAgICAgb25DaGFuZ2U6IHRoaXMub25DaGFuZ2UsXG4gICAgICAgIG9uRm9jdXM6IHRoaXMub25Gb2N1cyxcbiAgICAgICAgb25CbHVyOiB0aGlzLm9uQmx1clxuICAgICAgfSkpO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvcmUuZmllbGRcblxuLypcblRoZSBjb3JlIGZpZWxkIHBsdWdpbiBwcm92aWRlcyB0aGUgRmllbGQgcHJvdG90eXBlLiBGaWVsZHMgcmVwcmVzZW50IGFcbnBhcnRpY3VsYXIgc3RhdGUgaW4gdGltZSBvZiBhIGZpZWxkIGRlZmluaXRpb24sIGFuZCB0aGV5IHByb3ZpZGUgaGVscGVyIG1ldGhvZHNcbnRvIG5vdGlmeSB0aGUgZm9ybSBzdG9yZSBvZiBjaGFuZ2VzLlxuXG5GaWVsZHMgYXJlIGxhemlseSBjcmVhdGVkIGFuZCBldmFsdWF0ZWQsIGJ1dCBvbmNlIGV2YWx1YXRlZCwgdGhleSBzaG91bGQgYmVcbmNvbnNpZGVyZWQgaW1tdXRhYmxlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgdmFyIHJvdXRlciA9IHBsdWdpbi5yZXF1aXJlKCdmaWVsZC1yb3V0ZXInKTtcbiAgdmFyIHV0aWwgPSBwbHVnaW4ucmVxdWlyZSgndXRpbCcpO1xuICB2YXIgZXZhbHVhdG9yID0gcGx1Z2luLnJlcXVpcmUoJ2V2YWwnKTtcbiAgdmFyIGNvbXBpbGVyID0gcGx1Z2luLnJlcXVpcmUoJ2NvbXBpbGVyJyk7XG5cbiAgLy8gVGhlIEZpZWxkIGNvbnN0cnVjdG9yLlxuICB2YXIgRmllbGQgPSBmdW5jdGlvbiAoZm9ybSwgZGVmLCB2YWx1ZSwgcGFyZW50KSB7XG4gICAgdmFyIGZpZWxkID0gdGhpcztcblxuICAgIGZpZWxkLmZvcm0gPSBmb3JtO1xuICAgIGZpZWxkLmRlZiA9IGRlZjtcbiAgICBmaWVsZC52YWx1ZSA9IHZhbHVlO1xuICAgIGZpZWxkLnBhcmVudCA9IHBhcmVudDtcbiAgICBmaWVsZC5ncm91cHMgPSB7fTtcbiAgICBmaWVsZC50ZW1wQ2hpbGRyZW4gPSBbXTtcbiAgfTtcblxuICAvLyBBdHRhY2ggYSBmaWVsZCBmYWN0b3J5IHRvIHRoZSBmb3JtIHByb3RvdHlwZS5cbiAgcGx1Z2luLmV4cG9ydHMuZmllbGQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGZvcm0gPSB0aGlzO1xuXG4gICAgcmV0dXJuIG5ldyBGaWVsZChmb3JtLCB7XG4gICAgICB0eXBlOiAncm9vdCdcbiAgICB9LCBmb3JtLnN0b3JlLnZhbHVlKTtcbiAgfTtcblxuICB2YXIgcHJvdG8gPSBGaWVsZC5wcm90b3R5cGU7XG5cbiAgLy8gUmV0dXJuIHRoZSB0eXBlIHBsdWdpbiBmb3IgdGhpcyBmaWVsZC5cbiAgcHJvdG8udHlwZVBsdWdpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgZmllbGQgPSB0aGlzO1xuXG4gICAgaWYgKCFmaWVsZC5fdHlwZVBsdWdpbikge1xuICAgICAgZmllbGQuX3R5cGVQbHVnaW4gPSBudWxsO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZmllbGQuX3R5cGVQbHVnaW4gPSBwbHVnaW4ucmVxdWlyZSgndHlwZS4nICsgZmllbGQuZGVmLnR5cGUpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmxvZygnUHJvYmxlbSB0cnlpbmcgdG8gbG9hZCB0eXBlIHBsdWdpbi4nKTtcbiAgICAgICAgY29uc29sZS5sb2coJ0ZpZWxkIGRlZmluaXRpb246Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGZpZWxkLmRlZiwgbnVsbCwgMikpO1xuICAgICAgICBjb25zb2xlLmxvZyhmaWVsZC52YWx1ZVBhdGgoKSk7XG4gICAgICAgIGNvbnNvbGUubG9nKGUuc3RhY2spO1xuICAgICAgfVxuICAgICAgaWYgKCFmaWVsZC5fdHlwZVBsdWdpbikge1xuICAgICAgICBmaWVsZC5fdHlwZVBsdWdpbiA9IHt9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmaWVsZC5fdHlwZVBsdWdpbjtcbiAgfTtcblxuICAvLyBHZXQgYSBjb21wb25lbnQgZm9yIHRoaXMgZmllbGQuXG4gIHByb3RvLmNvbXBvbmVudCA9IGZ1bmN0aW9uIChwcm9wcykge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG4gICAgcHJvcHMgPSBfLmV4dGVuZCh7fSwgcHJvcHMsIHtmaWVsZDogZmllbGR9KTtcbiAgICB2YXIgY29tcG9uZW50ID0gcm91dGVyLmNvbXBvbmVudEZvckZpZWxkKGZpZWxkKTtcbiAgICByZXR1cm4gY29tcG9uZW50KHByb3BzKTtcbiAgfTtcblxuICAvLyBHZXQgdGhlIGNoaWxkIGZpZWxkcyBmb3IgdGhpcyBmaWVsZC5cbiAgcHJvdG8uZmllbGRzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBpZiAoIWZpZWxkLl9maWVsZHMpIHtcbiAgICAgIHZhciBmaWVsZHM7XG4gICAgICBpZiAoZmllbGQudHlwZVBsdWdpbigpLmZpZWxkcykge1xuICAgICAgICBmaWVsZHMgPSBmaWVsZC50eXBlUGx1Z2luKCkuZmllbGRzKGZpZWxkKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQuZGVmLmZpZWxkcykge1xuICAgICAgICBmaWVsZHMgPSBmaWVsZC5kZWYuZmllbGRzLm1hcChmdW5jdGlvbiAoZGVmKSB7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkLmNyZWF0ZUNoaWxkKGRlZik7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZmllbGRzID0gW107XG4gICAgICB9XG4gICAgICBmaWVsZC5fZmllbGRzID0gZmllbGRzO1xuICAgIH1cblxuICAgIHJldHVybiBmaWVsZC5fZmllbGRzO1xuICB9O1xuXG4gIC8vIEdldCB0aGUgaXRlbXMgKGNoaWxkIGZpZWxkIGRlZmluaXRpb25zKSBmb3IgdGhpcyBmaWVsZC5cbiAgcHJvdG8uaXRlbXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGZpZWxkID0gdGhpcztcblxuICAgIGlmICghZmllbGQuX2l0ZW1zKSB7XG4gICAgICBpZiAoXy5pc0FycmF5KGZpZWxkLmRlZi5pdGVtcykpIHtcbiAgICAgICAgZmllbGQuX2l0ZW1zID0gZmllbGQuZGVmLml0ZW1zLm1hcChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICAgIHJldHVybiBmaWVsZC5yZXNvbHZlKGl0ZW0pO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpZWxkLl9pdGVtcyA9IFtdO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmaWVsZC5faXRlbXM7XG4gIH07XG5cbiAgLy8gUmVzb2x2ZSBhIGZpZWxkIHJlZmVyZW5jZSBpZiBuZWNlc3NhcnkuXG4gIHByb3RvLnJlc29sdmUgPSBmdW5jdGlvbiAoZGVmKSB7XG4gICAgdmFyIGZpZWxkID0gdGhpcztcblxuICAgIGlmIChfLmlzU3RyaW5nKGRlZikpIHtcbiAgICAgIGRlZiA9IGZpZWxkLmZvcm0uZmluZERlZihkZWYpO1xuICAgICAgaWYgKCFkZWYpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCBmaWVsZDogJyArIGRlZik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZjtcbiAgfTtcblxuICAvLyBFdmFsdWF0ZSBhIGZpZWxkIGRlZmluaXRpb24gYW5kIHJldHVybiBhIG5ldyBmaWVsZCBkZWZpbml0aW9uLlxuICBwcm90by5ldmFsRGVmID0gZnVuY3Rpb24gKGRlZikge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBpZiAoZGVmLmV2YWwpIHtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgdmFyIGV4dERlZiA9IGZpZWxkLmV2YWwoZGVmLmV2YWwpO1xuICAgICAgICBpZiAoZXh0RGVmKSB7XG4gICAgICAgICAgZGVmID0gXy5leHRlbmQoe30sIGRlZiwgZXh0RGVmKTtcbiAgICAgICAgICBpZiAoZGVmLmZpZWxkcykge1xuICAgICAgICAgICAgZGVmLmZpZWxkcyA9IGRlZi5maWVsZHMubWFwKGZ1bmN0aW9uIChjaGlsZERlZikge1xuICAgICAgICAgICAgICBjaGlsZERlZiA9IGNvbXBpbGVyLmV4cGFuZERlZihjaGlsZERlZiwgZmllbGQuZm9ybS5zdG9yZS50ZW1wbGF0ZU1hcCk7XG4gICAgICAgICAgICAgIHJldHVybiBjb21waWxlci5jb21waWxlRGVmKGNoaWxkRGVmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBkZWYgPSBjb21waWxlci5jb21waWxlRGVmKGRlZik7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1Byb2JsZW0gaW4gZXZhbDogJywgSlNPTi5zdHJpbmdpZnkoZGVmLmV2YWwpKTtcbiAgICAgICAgY29uc29sZS5sb2coZS5tZXNzYWdlKTtcbiAgICAgICAgY29uc29sZS5sb2coZS5zdGFjayk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZjtcbiAgfTtcblxuICAvLyBFdmFsdWF0ZSBhbiBleHByZXNzaW9uIGluIHRoZSBjb250ZXh0IG9mIGEgZmllbGQuXG4gIHByb3RvLmV2YWwgPSBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgY29udGV4dCkge1xuICAgIHJldHVybiBldmFsdWF0b3IuZXZhbHVhdGUoZXhwcmVzc2lvbiwgdGhpcywgY29udGV4dCk7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgY2hpbGQgZmllbGQgZnJvbSBhIGRlZmluaXRpb24uXG4gIHByb3RvLmNyZWF0ZUNoaWxkID0gZnVuY3Rpb24gKGRlZikge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBkZWYgPSBmaWVsZC5yZXNvbHZlKGRlZik7XG5cbiAgICB2YXIgdmFsdWUgPSBmaWVsZC52YWx1ZTtcblxuICAgIGRlZiA9IGZpZWxkLmV2YWxEZWYoZGVmKTtcblxuICAgIGlmICghdXRpbC5pc0JsYW5rKGRlZi5rZXkpKSB7XG4gICAgICBpZiAodmFsdWUgJiYgIV8uaXNVbmRlZmluZWQodmFsdWVbZGVmLmtleV0pKSB7XG4gICAgICAgIHZhbHVlID0gdmFsdWVbZGVmLmtleV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgPSBkZWYudmFsdWU7XG4gICAgfVxuXG4gICAgaWYgKCFkZWYudHlwZSkge1xuICAgICAgdmFyIHR5cGVEZWYgPSB1dGlsLmZpZWxkRGVmRnJvbVZhbHVlKHZhbHVlKTtcbiAgICAgIGRlZiA9IF8uZXh0ZW5kKHt9LCBkZWYpO1xuICAgICAgZGVmLnR5cGUgPSB0eXBlRGVmLnR5cGU7XG4gICAgICBkZWYgPSBjb21waWxlci5jb21waWxlRGVmKGRlZik7XG4gICAgfVxuXG4gICAgdmFyIGNoaWxkRmllbGQgPSBuZXcgRmllbGQoZmllbGQuZm9ybSwgZGVmLCB2YWx1ZSwgZmllbGQpO1xuXG4gICAgZmllbGQudGVtcENoaWxkcmVuLnB1c2goY2hpbGRGaWVsZCk7XG5cbiAgICByZXR1cm4gY2hpbGRGaWVsZDtcblxuICAgIC8vIGlmIChkZWYuZXZhbCkge1xuICAgIC8vICAgZGVmID0gY2hpbGRGaWVsZC5ldmFsRGVmKGRlZik7XG4gICAgLy8gICBpZiAodXRpbC5pc0JsYW5rKGRlZi5rZXkpKSB7XG4gICAgLy8gICAgIHZhbHVlID0gZGVmLnZhbHVlO1xuICAgIC8vICAgfVxuICAgIC8vICAgY2hpbGRGaWVsZCA9IG5ldyBGaWVsZChmaWVsZC5mb3JtLCBkZWYsIHZhbHVlLCBmaWVsZCk7XG4gICAgLy8gfVxuICAgIC8vXG4gICAgLy8gcmV0dXJuIGNoaWxkRmllbGQ7XG4gIH07XG5cbiAgLy8gR2l2ZW4gYSB2YWx1ZSwgZmluZCBhbiBhcHByb3ByaWF0ZSBmaWVsZCBkZWZpbml0aW9uIGZvciB0aGlzIGZpZWxkLlxuICBwcm90by5pdGVtRm9yVmFsdWUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgZmllbGQgPSB0aGlzO1xuXG4gICAgdmFyIGl0ZW0gPSBfLmZpbmQoZmllbGQuaXRlbXMoKSwgZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgIHJldHVybiB1dGlsLml0ZW1NYXRjaGVzVmFsdWUoaXRlbSwgdmFsdWUpO1xuICAgIH0pO1xuICAgIGlmIChpdGVtKSB7XG4gICAgICBpdGVtID0gXy5leHRlbmQoe30sIGl0ZW0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBpdGVtID0gdXRpbC5maWVsZERlZkZyb21WYWx1ZSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGl0ZW07XG4gIH07XG5cbiAgLy8gR2V0IGFsbCB0aGUgZmllbGRzIGJlbG9uZ2luZyB0byBhIGdyb3VwLlxuICBwcm90by5ncm91cEZpZWxkcyA9IGZ1bmN0aW9uIChncm91cE5hbWUsIGlnbm9yZVRlbXBDaGlsZHJlbikge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBpZiAoIWZpZWxkLmdyb3Vwc1tncm91cE5hbWVdKSB7XG4gICAgICBmaWVsZC5ncm91cHNbZ3JvdXBOYW1lXSA9IFtdO1xuXG4gICAgICBpZiAoZmllbGQucGFyZW50KSB7XG4gICAgICAgIHZhciBzaWJsaW5ncyA9IGZpZWxkLnBhcmVudC5maWVsZHMoKTtcbiAgICAgICAgc2libGluZ3MuZm9yRWFjaChmdW5jdGlvbiAoc2libGluZykge1xuICAgICAgICAgIGlmIChzaWJsaW5nICE9PSBmaWVsZCAmJiBzaWJsaW5nLmRlZi5ncm91cCA9PT0gZ3JvdXBOYW1lKSB7XG4gICAgICAgICAgICBmaWVsZC5ncm91cHNbZ3JvdXBOYW1lXS5wdXNoKHNpYmxpbmcpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBwYXJlbnRHcm91cEZpZWxkcyA9IGZpZWxkLnBhcmVudC5ncm91cEZpZWxkcyhncm91cE5hbWUsIHRydWUpO1xuICAgICAgICBmaWVsZC5ncm91cHNbZ3JvdXBOYW1lXSA9IGZpZWxkLmdyb3Vwc1tncm91cE5hbWVdLmNvbmNhdChwYXJlbnRHcm91cEZpZWxkcyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFpZ25vcmVUZW1wQ2hpbGRyZW4gJiYgZmllbGQuZ3JvdXBzW2dyb3VwTmFtZV0ubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyBsb29raW5nIGF0IGNoaWxkcmVuIHNvIGZhclxuICAgICAgdmFyIGNoaWxkR3JvdXBGaWVsZHMgPSBbXTtcbiAgICAgIGZpZWxkLnRlbXBDaGlsZHJlbi5mb3JFYWNoKGZ1bmN0aW9uIChjaGlsZCkge1xuICAgICAgICBpZiAoY2hpbGQuZGVmLmdyb3VwID09PSBncm91cE5hbWUpIHtcbiAgICAgICAgICBjaGlsZEdyb3VwRmllbGRzLnB1c2goY2hpbGQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiBjaGlsZEdyb3VwRmllbGRzO1xuICAgIH1cblxuICAgIHJldHVybiBmaWVsZC5ncm91cHNbZ3JvdXBOYW1lXTtcbiAgfTtcblxuICAvLyBXYWxrIGJhY2t3YXJkcyB0aHJvdWdoIHBhcmVudHMgYW5kIGJ1aWxkIG91dCBhIHBhdGggYXJyYXkgdG8gdGhlIHZhbHVlLlxuICBwcm90by52YWx1ZVBhdGggPSBmdW5jdGlvbiAoY2hpbGRQYXRoKSB7XG4gICAgdmFyIGZpZWxkID0gdGhpcztcblxuICAgIHZhciBwYXRoID0gY2hpbGRQYXRoIHx8IFtdO1xuICAgIGlmICghdXRpbC5pc0JsYW5rKGZpZWxkLmRlZi5rZXkpKSB7XG4gICAgICBwYXRoID0gW2ZpZWxkLmRlZi5rZXldLmNvbmNhdChwYXRoKTtcbiAgICB9XG4gICAgaWYgKGZpZWxkLnBhcmVudCkge1xuICAgICAgcmV0dXJuIGZpZWxkLnBhcmVudC52YWx1ZVBhdGgocGF0aCk7XG4gICAgfVxuICAgIHJldHVybiBwYXRoO1xuICB9O1xuXG4gIC8vIFNldCB0aGUgdmFsdWUgZm9yIHRoaXMgZmllbGQuXG4gIHByb3RvLnZhbCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBmaWVsZC5mb3JtLmFjdGlvbnMuc2V0VmFsdWUoZmllbGQsIHZhbHVlKTtcbiAgfTtcblxuICAvLyBSZW1vdmUgYSBjaGlsZCB2YWx1ZSBmcm9tIHRoaXMgZmllbGQuXG4gIHByb3RvLnJlbW92ZSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgZmllbGQgPSB0aGlzO1xuXG4gICAgZmllbGQuZm9ybS5hY3Rpb25zLnJlbW92ZVZhbHVlKGZpZWxkLCBrZXkpO1xuICB9O1xuXG4gIC8vIE1vdmUgYSBjaGlsZCB2YWx1ZSBmcm9tIG9uZSBrZXkgdG8gYW5vdGhlci5cbiAgcHJvdG8ubW92ZSA9IGZ1bmN0aW9uIChmcm9tS2V5LCB0b0tleSkge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBmaWVsZC5mb3JtLmFjdGlvbnMubW92ZVZhbHVlKGZpZWxkLCBmcm9tS2V5LCB0b0tleSk7XG4gIH07XG5cbiAgLy8gR2V0IHRoZSBkZWZhdWx0IHZhbHVlIGZvciB0aGlzIGZpZWxkLlxuICBwcm90by5kZWZhdWx0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQoZmllbGQuZGVmLnZhbHVlKSkge1xuICAgICAgcmV0dXJuIHV0aWwuY29weVZhbHVlKGZpZWxkLmRlZi52YWx1ZSk7XG4gICAgfVxuXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKGZpZWxkLmRlZi5kZWZhdWx0KSkge1xuICAgICAgcmV0dXJuIHV0aWwuY29weVZhbHVlKGZpZWxkLmRlZi5kZWZhdWx0KTtcbiAgICB9XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQoZmllbGQudHlwZVBsdWdpbigpLmRlZmF1bHQpKSB7XG4gICAgICByZXR1cm4gdXRpbC5jb3B5VmFsdWUoZmllbGQudHlwZVBsdWdpbigpLmRlZmF1bHQpO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9O1xuXG4gIC8vIEFwcGVuZCBhIG5ldyB2YWx1ZS4gVXNlIHRoZSBgaXRlbUluZGV4YCB0byBnZXQgYW4gYXBwcm9wcmlhdGVcbiAgLy8gaXRlbSwgaW5mbGF0ZSBpdCwgYW5kIGNyZWF0ZSBhIGRlZmF1bHQgdmFsdWUuXG4gIHByb3RvLmFwcGVuZCA9IGZ1bmN0aW9uIChpdGVtSW5kZXgsIGtleSkge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICB2YXIgaXRlbSA9IGZpZWxkLml0ZW1zKClbaXRlbUluZGV4XTtcbiAgICBpZiAoaXRlbSkge1xuICAgICAgaXRlbSA9IF8uZXh0ZW5kKGl0ZW0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGYWxsYmFjayB0byBhIHN0cmluZyBmaWVsZC4gT3Igc2hvdWxkIHdlIGZhbGxiYWNrIHRvIGpzb24/Pz9cbiAgICAgIGl0ZW0gPSB7XG4gICAgICAgIHR5cGU6ICdzdHJpbmcnXG4gICAgICB9O1xuICAgIH1cblxuICAgIHZhciB2YWx1ZSA9IGZpZWxkLnZhbHVlO1xuXG4gICAgaWYgKCF2YWx1ZSkge1xuICAgICAgdmFsdWUgPSBrZXkgPyB7fSA6IFtdO1xuICAgICAgZmllbGQudmFsKHZhbHVlKTtcbiAgICB9XG5cbiAgICBpdGVtLmtleSA9IGtleSA/IGtleSA6IHZhbHVlLmxlbmd0aDtcblxuICAgIHZhciBjaGlsZCA9IGZpZWxkLmNyZWF0ZUNoaWxkKGl0ZW0pO1xuXG4gICAgdmFyIG9iaiA9IGNoaWxkLmRlZmF1bHQoKTtcblxuICAgIGlmIChfLmlzQXJyYXkob2JqKSB8fCBfLmlzT2JqZWN0KG9iaikpIHtcbiAgICAgIHZhciBjaG9wID0gZmllbGQudmFsdWVQYXRoKCkubGVuZ3RoICsgMTtcblxuICAgICAgY2hpbGQuaW5mbGF0ZShmdW5jdGlvbiAocGF0aCwgdmFsdWUpIHtcbiAgICAgICAgb2JqID0gdXRpbC5zZXRJbihvYmosIHBhdGguc2xpY2UoY2hvcCksIHZhbHVlKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChrZXkpIHtcbiAgICAgIGZpZWxkLmZvcm0uYWN0aW9ucy5zZXRWYWx1ZShjaGlsZCwgb2JqKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmllbGQuZm9ybS5hY3Rpb25zLmFwcGVuZFZhbHVlKGZpZWxkLCBvYmopO1xuICAgIH1cbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgd2hldGhlciB0aGUgZmllbGQgaXMgaGlkZGVuLlxuICBwcm90by5oaWRkZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGZpZWxkID0gdGhpcztcblxuICAgIHJldHVybiBmaWVsZC5kZWYuaGlkZGVuIHx8IGZpZWxkLnR5cGVQbHVnaW4oKS5oaWRkZW47XG4gIH07XG5cbiAgLy8gRXhwYW5kIGFsbCBjaGlsZCBmaWVsZHMgYW5kIGNhbGwgdGhlIHNldHRlciBmdW5jdGlvbiB3aXRoIHRoZSBkZWZhdWx0XG4gIC8vIHZhbHVlcyBhdCBlYWNoIHBhdGguXG4gIHByb3RvLmluZmxhdGUgPSBmdW5jdGlvbiAob25TZXRWYWx1ZSkge1xuICAgIHZhciBmaWVsZCA9IHRoaXM7XG5cbiAgICBpZiAoIXV0aWwuaXNCbGFuayhmaWVsZC5kZWYua2V5KSAmJiBfLmlzVW5kZWZpbmVkKGZpZWxkLnZhbHVlKSkge1xuICAgICAgb25TZXRWYWx1ZShmaWVsZC52YWx1ZVBhdGgoKSwgZmllbGQuZGVmYXVsdCgpKTtcbiAgICB9XG5cbiAgICB2YXIgZmllbGRzID0gZmllbGQuZmllbGRzKCk7XG5cbiAgICBmaWVsZHMuZm9yRWFjaChmdW5jdGlvbiAoY2hpbGQpIHtcbiAgICAgIGNoaWxkLmluZmxhdGUob25TZXRWYWx1ZSk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ2FsbGVkIGZyb20gdW5tb3VudC4gV2hlbiBmaWVsZHMgYXJlIHJlbW92ZWQgZm9yIHdoYXRldmVyIHJlYXNvbiwgd2VcbiAgLy8gc2hvdWxkIGRlbGV0ZSB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZS5cbiAgcHJvdG8uZXJhc2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGZpZWxkID0gdGhpcztcbiAgICBpZiAoIXV0aWwuaXNCbGFuayhmaWVsZC5kZWYua2V5KSAmJiAhXy5pc1VuZGVmaW5lZChmaWVsZC52YWx1ZSkpIHtcbiAgICAgIGZpZWxkLmZvcm0uYWN0aW9ucy5lcmFzZVZhbHVlKGZpZWxkLCB7fSk7XG4gICAgfVxuICB9O1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gIyBjb3JlLmZvcm0taW5pdFxuXG4vKlxuVGhpcyBwbHVnaW4gbWFrZXMgaXQgZWFzeSB0byBob29rIGludG8gZm9ybSBpbml0aWFsaXphdGlvbiwgd2l0aG91dCBoYXZpbmcgdG9cbmNvbmZpZ3VyZSBhbGwgdGhlIG90aGVyIGNvcmUgcGx1Z2lucy5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgdmFyIGluaXRQbHVnaW5zID0gcGx1Z2luLnJlcXVpcmVBbGwocGx1Z2luLmNvbmZpZy5pbml0KTtcblxuICB2YXIgcHJvdG8gPSBwbHVnaW4uZXhwb3J0cztcblxuICBwcm90by5pbml0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBmb3JtID0gdGhpcztcblxuICAgIGluaXRQbHVnaW5zLmZvckVhY2goZnVuY3Rpb24gKHBsdWdpbikge1xuICAgICAgcGx1Z2luLmFwcGx5KGZvcm0sIGFyZ3VtZW50cyk7XG4gICAgfSk7XG4gIH07XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb3JlLmZvcm1cblxuLypcblRoZSBjb3JlIGZvcm0gcGx1Z2luIHN1cHBsaWVzIG1ldGhvZHMgdGhhdCBnZXQgYWRkZWQgdG8gdGhlIEZvcm0gcHJvdG90eXBlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudGVtaXR0ZXIzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHZhciBwcm90byA9IHBsdWdpbi5leHBvcnRzO1xuXG4gIC8vIEdldCB0aGUgc3RvcmUgcGx1Z2luLlxuICB2YXIgY3JlYXRlU3RvcmUgPSBwbHVnaW4ucmVxdWlyZShwbHVnaW4uY29uZmlnLnN0b3JlKTtcblxuICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG4gIHZhciBsb2FkZXIgPSBwbHVnaW4ucmVxdWlyZSgnbG9hZGVyJyk7XG5cbiAgLy8gSGVscGVyIHRvIGNyZWF0ZSBhY3Rpb25zLCB3aGljaCB3aWxsIHRlbGwgdGhlIHN0b3JlIHRoYXQgc29tZXRoaW5nIGhhc1xuICAvLyBoYXBwZW5lZC4gTm90ZSB0aGF0IGFjdGlvbnMgZ28gc3RyYWlnaHQgdG8gdGhlIHN0b3JlLiBObyBldmVudHMsXG4gIC8vIGRpc3BhdGNoZXIsIGV0Yy5cbiAgdmFyIGNyZWF0ZVN5bmNBY3Rpb25zID0gZnVuY3Rpb24gKHN0b3JlLCBuYW1lcykge1xuICAgIHZhciBhY3Rpb25zID0ge307XG4gICAgbmFtZXMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgYWN0aW9uc1tuYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc3RvcmVbbmFtZV0uYXBwbHkoc3RvcmUsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICAgIHJldHVybiBhY3Rpb25zO1xuICB9O1xuXG4gIC8vIEluaXRpYWxpemUgdGhlIGZvcm0gaW5zdGFuY2UuXG4gIHByb3RvLmluaXQgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIHZhciBmb3JtID0gdGhpcztcblxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgLy8gTmVlZCBhbiBlbWl0dGVyIHRvIGVtaXQgY2hhbmdlIGV2ZW50cyBmcm9tIHRoZSBzdG9yZS5cbiAgICB2YXIgc3RvcmVFbWl0dGVyID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuXG4gICAgLy8gQ3JlYXRlIGEgc3RvcmUuXG4gICAgZm9ybS5zdG9yZSA9IGNyZWF0ZVN0b3JlKGZvcm0sIHN0b3JlRW1pdHRlciwgb3B0aW9ucyk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGFjdGlvbnMgdG8gbm90aWZ5IHRoZSBzdG9yZSBvZiBjaGFuZ2VzLlxuICAgIGZvcm0uYWN0aW9ucyA9IGNyZWF0ZVN5bmNBY3Rpb25zKGZvcm0uc3RvcmUsIFsnc2V0Rm9ybVZhbHVlJywgJ3NldFZhbHVlJywgJ3NldEZpZWxkcycsICdyZW1vdmVWYWx1ZScsICdhcHBlbmRWYWx1ZScsICdtb3ZlVmFsdWUnLCAnZXJhc2VWYWx1ZScsICdzZXRNZXRhJ10pO1xuXG4gICAgLy8gU2VlZCB0aGUgdmFsdWUgZnJvbSBhbnkgZmllbGRzLlxuICAgIGZvcm0uc3RvcmUuaW5mbGF0ZSgpO1xuXG4gICAgLy8gQWRkIG9uL29mZiB0byBnZXQgY2hhbmdlIGV2ZW50cyBmcm9tIGZvcm0uXG4gICAgZm9ybS5vbiA9IHN0b3JlRW1pdHRlci5vbi5iaW5kKHN0b3JlRW1pdHRlcik7XG4gICAgZm9ybS5vZmYgPSBzdG9yZUVtaXR0ZXIub2ZmLmJpbmQoc3RvcmVFbWl0dGVyKTtcbiAgICBmb3JtLm9uY2UgPSBzdG9yZUVtaXR0ZXIub25jZS5iaW5kKHN0b3JlRW1pdHRlcik7XG4gIH07XG5cbiAgLy8gR2V0IG9yIHNldCB0aGUgdmFsdWUgb2YgYSBmb3JtLlxuICBwcm90by52YWwgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgZm9ybSA9IHRoaXM7XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybS5hY3Rpb25zLnNldEZvcm1WYWx1ZSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHV0aWwuY29weVZhbHVlKGZvcm0uc3RvcmUudmFsdWUpO1xuICB9O1xuXG4gIC8vIFNldC9jaGFuZ2UgdGhlIGZpZWxkcyBmb3IgYSBmb3JtLlxuICBwcm90by5maWVsZHMgPSBmdW5jdGlvbiAoZmllbGRzKSB7XG4gICAgdmFyIGZvcm0gPSB0aGlzO1xuXG4gICAgZm9ybS5hY3Rpb25zLnNldEZpZWxkcyhmaWVsZHMpO1xuICB9O1xuXG4gIC8vIEZpbmQgYSBmaWVsZCB0ZW1wbGF0ZSBnaXZlbiBhIGtleS5cbiAgcHJvdG8uZmluZERlZiA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgZm9ybSA9IHRoaXM7XG5cbiAgICByZXR1cm4gZm9ybS5zdG9yZS50ZW1wbGF0ZU1hcFtrZXldIHx8IG51bGw7XG4gIH07XG5cbiAgLy8gR2V0IG9yIHNldCBtZXRhZGF0YS5cbiAgcHJvdG8ubWV0YSA9IGZ1bmN0aW9uIChrZXksIHZhbHVlLCBzdGF0dXMpIHtcbiAgICB2YXIgZm9ybSA9IHRoaXM7XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybS5hY3Rpb25zLnNldE1ldGEoa2V5LCB2YWx1ZSwgc3RhdHVzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZm9ybS5zdG9yZS5nZXRNZXRhKGtleSk7XG4gIH07XG5cbiAgcHJvdG8ubWV0YVN0YXR1cyA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgZm9ybSA9IHRoaXM7XG5cbiAgICByZXR1cm4gZm9ybS5zdG9yZS5nZXRNZXRhU3RhdHVzKGtleSk7XG4gIH07XG5cbiAgLy8gTG9hZCBtZXRhZGF0YS5cbiAgcHJvdG8ubG9hZE1ldGEgPSBmdW5jdGlvbiAoc291cmNlLCBwYXJhbXMpIHtcblxuICAgIHBhcmFtcyA9IHBhcmFtcyB8fCB7fTtcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHBhcmFtcyk7XG4gICAgdmFyIHZhbGlkS2V5cyA9IGtleXMuZmlsdGVyKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHJldHVybiBwYXJhbXNba2V5XTtcbiAgICB9KTtcbiAgICBpZiAodmFsaWRLZXlzLmxlbmd0aCA8IGtleXMubGVuZ3RoKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxvYWRlci5sb2FkTWV0YSh0aGlzLCBzb3VyY2UsIHBhcmFtcyk7XG4gIH07XG5cbiAgcHJvdG8udW5sb2FkT3RoZXJNZXRhID0gZnVuY3Rpb24gKG5lZWRzKSB7XG4gICAgdmFyIGZvcm0gPSB0aGlzO1xuXG4gICAgdmFyIGtleXMgPSBuZWVkcy5tYXAoZnVuY3Rpb24gKG5lZWQpIHtcbiAgICAgIHJldHVybiB1dGlsLm1ldGFDYWNoZUtleS5hcHBseSh1dGlsLCBuZWVkKTtcbiAgICB9KTtcbiAgICB2YXIgZHJvcEtleXMgPSBfLndpdGhvdXQuYXBwbHkoXywgW2Zvcm0uc3RvcmUubWV0YUtleXMoKV0uY29uY2F0KGtleXMpKTtcbiAgICBkcm9wS2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIGZvcm0ubWV0YShrZXksIG51bGwsICd1bmxvYWRlZCcpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEFkZCBhIG1ldGRhdGEgc291cmNlIGZ1bmN0aW9uLCB2aWEgdGhlIGxvYWRlciBwbHVnaW4uXG4gIHByb3RvLnNvdXJjZSA9IGxvYWRlci5zb3VyY2U7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvcmUuZm9ybWF0aWNcblxuLypcblRoZSBjb3JlIGZvcm1hdGljIHBsdWdpbiBhZGRzIG1ldGhvZHMgdG8gdGhlIGZvcm1hdGljIGluc3RhbmNlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgdmFyIGYgPSBwbHVnaW4uZXhwb3J0cztcblxuICAvLyBVc2UgdGhlIGZpZWxkLXJvdXRlciBwbHVnaW4gYXMgdGhlIHJvdXRlci5cbiAgdmFyIHJvdXRlciA9IHBsdWdpbi5yZXF1aXJlKCdmaWVsZC1yb3V0ZXInKTtcblxuICAvLyBSb3V0ZSBhIGZpZWxkIHRvIGEgY29tcG9uZW50LlxuICBmLnJvdXRlID0gcm91dGVyLnJvdXRlO1xuXG4gIC8vIFJlbmRlciBhIGNvbXBvbmVudCB0byBhIG5vZGUuXG4gIGYucmVuZGVyID0gZnVuY3Rpb24gKGNvbXBvbmVudCwgbm9kZSkge1xuXG4gICAgUmVhY3QucmVuZGVyQ29tcG9uZW50KGNvbXBvbmVudCwgbm9kZSk7XG4gIH07XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGNvbXBpbGVyXG5cbi8vIFRoZSBjb21waWxlciBwbHVnaW4ga25vd3MgaG93IHRvIG5vcm1hbGl6ZSBmaWVsZCBkZWZpbml0aW9ucyBpbnRvIHN0YW5kYXJkXG4vLyBmaWVsZCBkZWZpbml0aW9ucyB0aGF0IGNhbiBiZSB1bmRlcnN0b29kIGJlIHJvdXRlcnMgYW5kIGNvbXBvbmVudHMuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIC8vIEdyYWIgYWxsIHRoZSBjb21waWxlciBwbHVnaW5zIHdoaWNoIGNhbiBiZSBzdGFja2VkLlxuICB2YXIgY29tcGlsZXJQbHVnaW5zID0gcGx1Z2luLnJlcXVpcmVBbGwocGx1Z2luLmNvbmZpZy5jb21waWxlcnMpO1xuXG4gIHZhciB1dGlsID0gcGx1Z2luLnJlcXVpcmUoJ3V0aWwnKTtcblxuICB2YXIgY29tcGlsZXIgPSBwbHVnaW4uZXhwb3J0cztcblxuICAvLyBGb3IgYSBzZXQgb2YgZmllbGRzLCBtYWtlIGEgbWFwIG9mIHRlbXBsYXRlIG5hbWVzIHRvIGZpZWxkIGRlZmluaXRpb25zLiBBbGxcbiAgLy8gZmllbGQgZGVmaW5pdGlvbnMgY2FuIGJlIHVzZWQgYXMgdGVtcGxhdGVzLCB3aGV0aGVyIG1hcmtlZCBhcyB0ZW1wbGF0ZXMgb3JcbiAgLy8gbm90LlxuICBjb21waWxlci50ZW1wbGF0ZU1hcCA9IGZ1bmN0aW9uIChmaWVsZHMpIHtcbiAgICB2YXIgbWFwID0ge307XG4gICAgZmllbGRzLmZvckVhY2goZnVuY3Rpb24gKGZpZWxkKSB7XG4gICAgICBpZiAoZmllbGQua2V5KSB7XG4gICAgICAgIG1hcFtmaWVsZC5rZXldID0gZmllbGQ7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuaWQpIHtcbiAgICAgICAgbWFwW2ZpZWxkLmlkXSA9IGZpZWxkO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBtYXA7XG4gIH07XG5cbiAgLy8gRmllbGRzIGFuZCBpdGVtcyBjYW4gZXh0ZW5kIG90aGVyIGZpZWxkIGRlZmluaXRpb25zLiBGaWVsZHMgY2FuIGFsc28gaGF2ZVxuICAvLyBjaGlsZCBmaWVsZHMgdGhhdCBwb2ludCB0byBvdGhlciBmaWVsZCBkZWZpbml0aW9ucy4gSGVyZSwgd2UgZXhwYW5kIGFsbFxuICAvLyB0aG9zZSBvdXQgc28gdGhhdCBjb21wb25lbnRzIGRvbid0IGhhdmUgdG8gd29ycnkgYWJvdXQgdGhpcy5cbiAgY29tcGlsZXIuZXhwYW5kRGVmID0gZnVuY3Rpb24gKGRlZiwgdGVtcGxhdGVNYXApIHtcbiAgICB2YXIgaXNUZW1wbGF0ZSA9IGRlZi50ZW1wbGF0ZTtcbiAgICB2YXIgZXh0ID0gZGVmLmV4dGVuZHM7XG4gICAgaWYgKF8uaXNTdHJpbmcoZXh0KSkge1xuICAgICAgZXh0ID0gW2V4dF07XG4gICAgfVxuICAgIGlmIChleHQpIHtcbiAgICAgIHZhciBiYXNlcyA9IGV4dC5tYXAoZnVuY3Rpb24gKGJhc2UpIHtcbiAgICAgICAgdmFyIHRlbXBsYXRlID0gdGVtcGxhdGVNYXBbYmFzZV07XG4gICAgICAgIGlmICghdGVtcGxhdGUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RlbXBsYXRlICcgKyBiYXNlICsgJyBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRlbXBsYXRlO1xuICAgICAgfSk7XG4gICAgICB2YXIgY2hhaW4gPSBbe31dLmNvbmNhdChiYXNlcy5yZXZlcnNlKCkuY29uY2F0KFtkZWZdKSk7XG4gICAgICBkZWYgPSBfLmV4dGVuZC5hcHBseShfLCBjaGFpbik7XG4gICAgfVxuICAgIGlmIChkZWYuZmllbGRzKSB7XG4gICAgICBkZWYuZmllbGRzID0gZGVmLmZpZWxkcy5tYXAoZnVuY3Rpb24gKGNoaWxkRGVmKSB7XG4gICAgICAgIGlmICghXy5pc1N0cmluZyhjaGlsZERlZikpIHtcbiAgICAgICAgICByZXR1cm4gY29tcGlsZXIuZXhwYW5kRGVmKGNoaWxkRGVmLCB0ZW1wbGF0ZU1hcCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNoaWxkRGVmO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChkZWYuaXRlbXMpIHtcbiAgICAgIGRlZi5pdGVtcyA9IGRlZi5pdGVtcy5tYXAoZnVuY3Rpb24gKGl0ZW1EZWYpIHtcbiAgICAgICAgaWYgKCFfLmlzU3RyaW5nKGl0ZW1EZWYpKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbXBpbGVyLmV4cGFuZERlZihpdGVtRGVmLCB0ZW1wbGF0ZU1hcCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGl0ZW1EZWY7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKCFpc1RlbXBsYXRlICYmIGRlZi50ZW1wbGF0ZSkge1xuICAgICAgZGVsZXRlIGRlZi50ZW1wbGF0ZTtcbiAgICB9XG4gICAgcmV0dXJuIGRlZjtcbiAgfTtcblxuICAvLyBGb3IgYW4gYXJyYXkgb2YgZmllbGQgZGVmaW5pdGlvbnMsIGV4cGFuZCBlYWNoIGZpZWxkIGRlZmluaXRpb24uXG4gIGNvbXBpbGVyLmV4cGFuZEZpZWxkcyA9IGZ1bmN0aW9uIChmaWVsZHMpIHtcbiAgICB2YXIgdGVtcGxhdGVNYXAgPSBjb21waWxlci50ZW1wbGF0ZU1hcChmaWVsZHMpO1xuICAgIHJldHVybiBmaWVsZHMubWFwKGZ1bmN0aW9uIChkZWYpIHtcbiAgICAgIHJldHVybiBjb21waWxlci5leHBhbmREZWYoZGVmLCB0ZW1wbGF0ZU1hcCk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gUnVuIGEgZmllbGQgZGVmaW5pdGlvbiB0aHJvdWdoIGFsbCBhdmFpbGFibGUgY29tcGlsZXJzLlxuICBjb21waWxlci5jb21waWxlRGVmID0gZnVuY3Rpb24gKGRlZikge1xuXG4gICAgLy9jb25zb2xlLmxvZygnaW46JywgSlNPTi5zdHJpbmdpZnkoZGVmKSlcblxuICAgIGRlZiA9IHV0aWwuZGVlcENvcHkoZGVmKTtcblxuICAgIHZhciByZXN1bHQ7XG4gICAgY29tcGlsZXJQbHVnaW5zLmZvckVhY2goZnVuY3Rpb24gKHBsdWdpbikge1xuICAgICAgcmVzdWx0ID0gcGx1Z2luLmNvbXBpbGUoZGVmKTtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgZGVmID0gcmVzdWx0O1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKGRlZi50eXBlKSB7XG4gICAgICB2YXIgdHlwZVBsdWdpbiA9IHBsdWdpbi5yZXF1aXJlKCd0eXBlLicgKyBkZWYudHlwZSk7XG5cbiAgICAgIGlmICh0eXBlUGx1Z2luLmNvbXBpbGUpIHtcbiAgICAgICAgcmVzdWx0ID0gdHlwZVBsdWdpbi5jb21waWxlKGRlZik7XG4gICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICBkZWYgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZGVmLmZpZWxkcykge1xuICAgICAgLy8gQ29tcGlsZSBhbnkgaW5saW5lIGZpZWxkcy5cbiAgICAgIGRlZi5maWVsZHMgPSBkZWYuZmllbGRzLm1hcChmdW5jdGlvbiAoY2hpbGREZWYpIHtcbiAgICAgICAgaWYgKF8uaXNPYmplY3QoY2hpbGREZWYpKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbXBpbGVyLmNvbXBpbGVEZWYoY2hpbGREZWYpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjaGlsZERlZjtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vY29uc29sZS5sb2coJ291dDonLCBKU09OLnN0cmluZ2lmeShkZWYpKVxuXG4gICAgcmV0dXJuIGRlZjtcbiAgfTtcblxuICAvLyBGb3IgYW4gYXJyYXkgb2YgZmllbGQgZGVmaW5pdGlvbnMsIGNvbXBpbGUgZWFjaCBmaWVsZCBkZWZpbml0aW9uLlxuICBjb21waWxlci5jb21waWxlRmllbGRzID0gZnVuY3Rpb24gKGZpZWxkcykge1xuICAgIHJldHVybiBmaWVsZHMubWFwKGZ1bmN0aW9uIChmaWVsZCkge1xuICAgICAgcmV0dXJuIGNvbXBpbGVyLmNvbXBpbGVEZWYoZmllbGQpO1xuICAgIH0pO1xuICB9O1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBjb21wb25lbnRcblxuLy8gQXQgaXRzIG1vc3QgYmFzaWMgbGV2ZWwsIHRoZSBjb21wb25lbnQgcGx1Z2luIHNpbXBseSBtYXBzIGNvbXBvbmVudCBuYW1lcyB0b1xuLy8gcGx1Z2luIG5hbWVzLCByZXR1cm5pbmcgdGhlIGNvbXBvbmVudCBmYWN0b3J5IGZvciB0aGF0IGNvbXBvbmVudC4gRm9yXG4vLyBleGFtcGxlLCBgcGx1Z2luLmNvbXBvbmVudCgndGV4dCcpYCBiZWNvbWVzXG4vLyBgcGx1Z2luLnJlcXVpcmUoJ2NvbXBvbmVudC50ZXh0JylgLiBUaGlzIGlzIGEgdXNlZnVsIHBsYWNob2xkZXIgaW4gY2FzZSB3ZVxuLy8gbGF0ZXIgd2FudCB0byBtYWtlIGZvcm1hdGljIGFibGUgdG8gZGVjaWRlIGNvbXBvbmVudHMgYXQgcnVudGltZS4gRm9yIG5vdyxcbi8vIGhvd2V2ZXIsIHRoaXMgYWxsb3dzIHVzIHRvIGluamVjdCBcInByb3AgbW9kaWZpZXJzXCIgd2hpY2ggYXJlIHBsdWdpbnMgdGhhdFxuLy8gbW9kaWZ5IGEgY29tcG9uZW50cyBwcm9wZXJ0aWVzIGJlZm9yZSBpdCByZWNlaXZlcyB0aGVtLlxuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBSZWFjdCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlJlYWN0IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5SZWFjdCA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICAvLyBSZWdpc3RyeSBmb3IgcHJvcCBtb2RpZmllcnMuXG4gIHZhciBwcm9wTW9kaWZpZXJzID0ge307XG5cbiAgLy8gQWRkIGEgXCJwcm9wIG1vZGlmZXJcIiB3aGljaCBpcyBqdXN0IGEgZnVuY3Rpb24gdGhhdCBtb2RpZmllcyBhIGNvbXBvbmVudHNcbiAgLy8gcHJvcGVydGllcyBiZWZvcmUgaXQgcmVjZWl2ZXMgdGhlbS5cbiAgdmFyIGFkZFByb3BNb2RpZmllciA9IGZ1bmN0aW9uIChuYW1lLCBtb2RpZnlGbikge1xuICAgIGlmICghcHJvcE1vZGlmaWVyc1tuYW1lXSkge1xuICAgICAgcHJvcE1vZGlmaWVyc1tuYW1lXSA9IFtdO1xuICAgIH1cbiAgICBwcm9wTW9kaWZpZXJzW25hbWVdLnB1c2gobW9kaWZ5Rm4pO1xuICB9O1xuXG4gIC8vIEdyYWIgYWxsIHRoZSBwcm9wIG1vZGlmaWVyIHBsdWdpbnMuXG4gIHZhciBwcm9wc1BsdWdpbnMgPSBwbHVnaW4ucmVxdWlyZUFsbChwbHVnaW4uY29uZmlnLnByb3BzKTtcblxuICAvLyBSZWdpc3RlciBhbGwgdGhlIHByb3AgbW9kaWZpZXIgcGx1Z2lucy5cbiAgcHJvcHNQbHVnaW5zLmZvckVhY2goZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIGFkZFByb3BNb2RpZmllci5hcHBseShudWxsLCBwbHVnaW4pO1xuICB9KTtcblxuICAvLyBSZWdpc3RyeSBmb3IgY29tcG9uZW50IGZhY3Rvcmllcy4gU2luY2Ugd2UnbGwgYmUgbW9kaWZ5aW5nIHRoZSBwcm9wcyBnb2luZ1xuICAvLyB0byB0aGUgZmFjdG9yaWVzLCB3ZSdsbCBzdG9yZSBvdXIgb3duIGNvbXBvbmVudCBmYWN0b3JpZXMgaGVyZS5cbiAgdmFyIGNvbXBvbmVudEZhY3RvcmllcyA9IHt9O1xuXG4gIC8vIFJldHJpZXZlIHRoZSBhcHByb3ByaWF0ZSBjb21wb25lbnQgZmFjdG9yeSwgd2hpY2ggbWF5IGJlIGEgd3JhcHBlciB0aGF0XG4gIC8vIHJ1bnMgdGhlIGNvbXBvbmVudCBwcm9wZXJ0aWVzIHRocm91Z2ggcHJvcCBtb2RpZmllciBmdW5jdGlvbnMuXG4gIHBsdWdpbi5leHBvcnRzLmNvbXBvbmVudCA9IGZ1bmN0aW9uIChuYW1lKSB7XG5cbiAgICBpZiAoIWNvbXBvbmVudEZhY3Rvcmllc1tuYW1lXSkge1xuICAgICAgdmFyIGNvbXBvbmVudCA9IFJlYWN0LmNyZWF0ZUZhY3RvcnkocGx1Z2luLnJlcXVpcmUoJ2NvbXBvbmVudC4nICsgbmFtZSkpO1xuICAgICAgY29tcG9uZW50RmFjdG9yaWVzW25hbWVdID0gZnVuY3Rpb24gKHByb3BzLCBjaGlsZHJlbikge1xuICAgICAgICBpZiAocHJvcE1vZGlmaWVyc1tuYW1lXSkge1xuICAgICAgICAgIHByb3BNb2RpZmllcnNbbmFtZV0uZm9yRWFjaChmdW5jdGlvbiAobW9kaWZ5KSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gbW9kaWZ5KHByb3BzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgcHJvcHMgPSByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudChwcm9wcywgY2hpbGRyZW4pO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBvbmVudEZhY3Rvcmllc1tuYW1lXTtcbiAgfTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgY29yZVxuXG4vLyBUaGUgY29yZSBwbHVnaW4gZXhwb3J0cyBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSBmb3JtYXRpYyBpbnN0YW5jZSBhbmRcbi8vIGV4dGVuZHMgdGhlIGluc3RhbmNlIHdpdGggYWRkaXRpb25hbCBtZXRob2RzLlxuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cyA9IGZ1bmN0aW9uIChmb3JtYXRpYykge1xuXG4gICAgLy8gVGhlIGNvcmUgcGx1Z2luIHJlYWxseSBkb2Vzbid0IGRvIG11Y2guIEl0IGFjdHVhbGx5IHJlbGllcyBvbiBvdGhlclxuICAgIC8vIHBsdWdpbnMgdG8gZG8gdGhlIGRpcnR5IHdvcmsuIFRoaXMgd2F5LCB5b3UgY2FuIGVhc2lseSBhZGQgYWRkaXRpb25hbFxuICAgIC8vIHBsdWdpbnMgdG8gZG8gbW9yZSBkaXJ0eSB3b3JrLlxuICAgIHZhciBmb3JtYXRpY1BsdWdpbnMgPSBwbHVnaW4ucmVxdWlyZUFsbChwbHVnaW4uY29uZmlnLmZvcm1hdGljKTtcblxuICAgIC8vIFdlIGhhdmUgc3BlY2lhbCBmb3JtIHBsdWdpbnMgd2hpY2ggYXJlIGp1c3QgdXNlZCB0byBtb2RpZnkgdGhlIEZvcm1cbiAgICAvLyBwcm90b3R5cGUuXG4gICAgdmFyIGZvcm1QbHVnaW5zID0gcGx1Z2luLnJlcXVpcmVBbGwocGx1Z2luLmNvbmZpZy5mb3JtKTtcblxuICAgIC8vIFBhc3MgdGhlIGZvcm1hdGljIGluc3RhbmNlIG9mZiB0byBlYWNoIG9mIHRoZSBmb3JtYXRpYyBwbHVnaW5zLlxuICAgIGZvcm1hdGljUGx1Z2lucy5mb3JFYWNoKGZ1bmN0aW9uIChmKSB7XG4gICAgICBfLmtleXMoZikuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChmb3JtYXRpY1trZXldKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJvcGVydHkgYWxyZWFkeSBkZWZpbmVkIGZvciBmb3JtYXRpYzogJyArIGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9ybWF0aWNba2V5XSA9IGZba2V5XTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gIyMgRm9ybSBwcm90b3R5cGVcblxuICAgIC8vIFRoZSBGb3JtIGNvbnN0cnVjdG9yIGNyZWF0ZXMgYSBmb3JtIGdpdmVuIGEgc2V0IG9mIG9wdGlvbnMuIE9wdGlvbnNcbiAgICAvLyBjYW4gaGF2ZSBgZmllbGRzYCBhbmQgYHZhbHVlYC5cbiAgICB2YXIgRm9ybSA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBpZiAodGhpcy5pbml0KSB7XG4gICAgICAgIHRoaXMuaW5pdChvcHRpb25zKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gQWRkIHRoZSBmb3JtIGZhY3RvcnkgdG8gdGhlIGZvcm1hdGljIGluc3RhbmNlLlxuICAgIGZvcm1hdGljLmZvcm0gPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcmV0dXJuIG5ldyBGb3JtKG9wdGlvbnMpO1xuICAgIH07XG5cbiAgICBGb3JtLnByb3RvdHlwZSA9IGZvcm1hdGljLmZvcm07XG5cbiAgICAvLyBLZWVwIGZvcm0gaW5pdCBtZXRob2RzIGhlcmUuXG4gICAgdmFyIGluaXRzID0gW107XG5cbiAgICAvLyBHbyB0aHJvdWdoIGZvcm0gcGx1Z2lucyBhbmQgYWRkIGVhY2ggcGx1Z2luJ3MgbWV0aG9kcyB0byB0aGUgZm9ybVxuICAgIC8vIHByb3RvdHlwZS5cbiAgICBmb3JtUGx1Z2lucy5mb3JFYWNoKGZ1bmN0aW9uIChwcm90bykge1xuICAgICAgXy5rZXlzKHByb3RvKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgLy8gSW5pdCBwbHVnaW5zIGNhbiBiZSBzdGFja2VkLlxuICAgICAgICBpZiAoa2V5ID09PSAnaW5pdCcpIHtcbiAgICAgICAgICBpbml0cy5wdXNoKHByb3RvW2tleV0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChGb3JtLnByb3RvdHlwZVtrZXldKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQcm9wZXJ0eSBhbHJlYWR5IGRlZmluZWQgZm9yIGZvcm06ICcgKyBrZXkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBGb3JtLnByb3RvdHlwZVtrZXldID0gcHJvdG9ba2V5XTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYW4gaW5pdCBtZXRob2QgZm9yIHRoZSBmb3JtIHByb3RvdHlwZSBiYXNlZCBvbiB0aGUgYXZhaWxhYmxlIGluaXRcbiAgICAvLyBtZXRob2RzLlxuICAgIGlmIChpbml0cy5sZW5ndGggPT09IDApIHtcbiAgICAgIEZvcm0ucHJvdG90eXBlLmluaXQgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICB9IGVsc2UgaWYgKGluaXRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgRm9ybS5wcm90b3R5cGUuaW5pdCA9IGluaXRzWzBdO1xuICAgIH0gZWxzZSB7XG4gICAgICBGb3JtLnByb3RvdHlwZS5pbml0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZm9ybSA9IHRoaXM7XG4gICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuXG4gICAgICAgIGluaXRzLmZvckVhY2goZnVuY3Rpb24gKGluaXQpIHtcbiAgICAgICAgICBpbml0LmFwcGx5KGZvcm0sIGFyZ3MpO1xuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgfVxuICB9O1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBldmFsLWZ1bmN0aW9uc1xuXG4vKlxuRGVmYXVsdCBldmFsIGZ1bmN0aW9ucy4gRWFjaCBmdW5jdGlvbiBpcyBwYXJ0IG9mIGl0cyBvd24gcGx1Z2luLCBidXQgYWxsIGFyZVxua2VwdCB0b2dldGhlciBoZXJlIGFzIHBhcnQgb2YgYSBwbHVnaW4gYnVuZGxlLlxuXG5Ob3RlIHRoYXQgZXZhbCBmdW5jdGlvbnMgZGVjaWRlIHdoZW4gdGhlaXIgYXJndW1lbnRzIGdldCBldmFsdWF0ZWQuIFRoaXMgd2F5LFxueW91IGNhbiBjcmVhdGUgY29udHJvbCBzdHJ1Y3R1cmVzIChsaWtlIGlmKSB0aGF0IGNvbmRpdGlvbmFsbHkgZXZhbHVhdGVzIGl0c1xuYXJndW1lbnRzLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcblxudmFyIHdyYXBGbiA9IGZ1bmN0aW9uIChmbikge1xuICByZXR1cm4gZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICBhcmdzID0gZmllbGQuZXZhbChhcmdzLCBjb250ZXh0KTtcbiAgICAgIHZhciByZXN1bHQgPSBmbi5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcbn07XG5cbnZhciBtZXRob2RDYWxsID0gZnVuY3Rpb24gKG1ldGhvZCkge1xuICByZXR1cm4gZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICBhcmdzID0gZmllbGQuZXZhbChhcmdzLCBjb250ZXh0KTtcbiAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIGFyZ3NbMF1bbWV0aG9kXS5hcHBseShhcmdzWzBdLCBhcmdzLnNsaWNlKDEpKTtcbiAgICAgIH1cbiAgICB9O1xuICB9O1xufTtcblxudmFyIHBsdWdpbnMgPSB7XG4gIGlmOiBmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgcGx1Z2luLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJncywgZmllbGQsIGNvbnRleHQpIHtcbiAgICAgIHJldHVybiBmaWVsZC5ldmFsKGFyZ3NbMF0sIGNvbnRleHQpID8gZmllbGQuZXZhbChhcmdzWzFdLCBjb250ZXh0KSA6IGZpZWxkLmV2YWwoYXJnc1syXSwgY29udGV4dCk7XG4gICAgfTtcbiAgfSxcblxuICBlcTogZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICByZXR1cm4gZmllbGQuZXZhbChhcmdzWzBdLCBjb250ZXh0KSA9PT0gZmllbGQuZXZhbChhcmdzWzFdLCBjb250ZXh0KTtcbiAgICB9O1xuICB9LFxuXG4gIG5vdDogZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICByZXR1cm4gIWZpZWxkLmV2YWwoYXJnc1swXSwgY29udGV4dCk7XG4gICAgfTtcbiAgfSxcblxuICBvcjogZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICB2YXIgYXJnO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGFyZyA9IGZpZWxkLmV2YWwoYXJnc1tpXSwgY29udGV4dCk7XG4gICAgICAgIGlmIChhcmcpIHtcbiAgICAgICAgICByZXR1cm4gYXJnO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gYXJnO1xuICAgIH07XG4gIH0sXG5cbiAgYW5kOiBmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgcGx1Z2luLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJncywgZmllbGQsIGNvbnRleHQpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgYXJnID0gZmllbGQuZXZhbChhcmdzW2ldLCBjb250ZXh0KTtcbiAgICAgICAgaWYgKCFhcmcgfHwgaSA9PT0gKGFyZ3MubGVuZ3RoIC0gMSkpIHtcbiAgICAgICAgICByZXR1cm4gYXJnO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH07XG4gIH0sXG5cbiAgZ2V0OiBmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgdmFyIGdldCA9IHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG4gICAgICB2YXIga2V5ID0gZmllbGQuZXZhbChhcmdzWzBdLCBjb250ZXh0KTtcbiAgICAgIHZhciBvYmo7XG4gICAgICBpZiAoY29udGV4dCAmJiBrZXkgaW4gY29udGV4dCkge1xuICAgICAgICBvYmogPSBjb250ZXh0W2tleV07XG4gICAgICB9IGVsc2UgaWYgKF8uaXNPYmplY3QoZmllbGQudmFsdWUpICYmIGtleSBpbiBmaWVsZC52YWx1ZSkge1xuICAgICAgICBvYmogPSBmaWVsZC52YWx1ZVtrZXldO1xuICAgICAgfSBlbHNlIGlmIChfLmlzT2JqZWN0KGZpZWxkLmRlZi5jb250ZXh0KSAmJiBrZXkgaW4gZmllbGQuZGVmLmNvbnRleHQpIHtcbiAgICAgICAgb2JqID0gZmllbGQuZGVmLmNvbnRleHRba2V5XTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQucGFyZW50KSB7XG4gICAgICAgIG9iaiA9IGdldChhcmdzLCBmaWVsZC5wYXJlbnQpO1xuICAgICAgfVxuICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMSkge1xuICAgICAgICB2YXIgZ2V0SW5LZXlzID0gZmllbGQuZXZhbChhcmdzLnNsaWNlKDEpLCBjb250ZXh0KTtcbiAgICAgICAgcmV0dXJuIHV0aWwuZ2V0SW4ob2JqLCBnZXRJbktleXMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuICB9LFxuXG4gIGdldEdyb3VwVmFsdWVzOiBmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgcGx1Z2luLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJncywgZmllbGQsIGNvbnRleHQpIHtcblxuICAgICAgdmFyIGdyb3VwTmFtZSA9IGZpZWxkLmV2YWwoYXJnc1swXSwgY29udGV4dCk7XG5cbiAgICAgIHZhciBncm91cEZpZWxkcyA9IGZpZWxkLmdyb3VwRmllbGRzKGdyb3VwTmFtZSk7XG5cbiAgICAgIHJldHVybiBncm91cEZpZWxkcy5tYXAoZnVuY3Rpb24gKGZpZWxkKSB7XG4gICAgICAgIHJldHVybiBmaWVsZC52YWx1ZTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0sXG5cbiAgZ2V0TWV0YTogZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICBhcmdzID0gZmllbGQuZXZhbChhcmdzLCBjb250ZXh0KTtcbiAgICAgIHJldHVybiBmaWVsZC5mb3JtLm1ldGEoYXJnc1swXSk7XG4gICAgfTtcbiAgfSxcblxuICBnZXRDYWNoZWRTb3VyY2U6IGZ1bmN0aW9uIChwbHVnaW4pIHtcbiAgICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG4gICAgcGx1Z2luLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJncywgZmllbGQsIGNvbnRleHQpIHtcbiAgICAgIGFyZ3MgPSBmaWVsZC5ldmFsKGFyZ3MsIGNvbnRleHQpO1xuICAgICAgdmFyIGNhY2hlS2V5ID0gdXRpbC5tZXRhQ2FjaGVLZXkoYXJnc1swXSwgYXJnc1sxXSk7XG4gICAgICByZXR1cm4gZmllbGQuZm9ybS5tZXRhKGNhY2hlS2V5KTtcbiAgICB9O1xuICB9LFxuXG4gIGdldE1ldGFTdGF0dXM6IGZ1bmN0aW9uIChwbHVnaW4pIHtcbiAgICBwbHVnaW4uZXhwb3J0cyA9IGZ1bmN0aW9uIChhcmdzLCBmaWVsZCwgY29udGV4dCkge1xuICAgICAgYXJncyA9IGZpZWxkLmV2YWwoYXJncywgY29udGV4dCk7XG4gICAgICByZXR1cm4gZmllbGQuZm9ybS5tZXRhU3RhdHVzKGFyZ3NbMF0pO1xuICAgIH07XG4gIH0sXG5cbiAgZ2V0Q2FjaGVkU291cmNlU3RhdHVzOiBmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgdmFyIHV0aWwgPSBwbHVnaW4ucmVxdWlyZSgndXRpbCcpO1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICBhcmdzID0gZmllbGQuZXZhbChhcmdzLCBjb250ZXh0KTtcbiAgICAgIHZhciBjYWNoZUtleSA9IHV0aWwubWV0YUNhY2hlS2V5KGFyZ3NbMF0sIGFyZ3NbMV0pO1xuICAgICAgcmV0dXJuIGZpZWxkLmZvcm0ubWV0YVN0YXR1cyhjYWNoZUtleSk7XG4gICAgfTtcbiAgfSxcblxuICBoYXNNZXRhRXJyb3I6IGZ1bmN0aW9uIChwbHVnaW4pIHtcbiAgICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG4gICAgcGx1Z2luLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJncywgZmllbGQsIGNvbnRleHQpIHtcbiAgICAgIGFyZ3MgPSBmaWVsZC5ldmFsKGFyZ3MsIGNvbnRleHQpO1xuICAgICAgdmFyIGNhY2hlS2V5ID0gdXRpbC5tZXRhQ2FjaGVLZXkoYXJnc1swXSwgYXJnc1sxXSk7XG4gICAgICByZXR1cm4gZmllbGQuZm9ybS5tZXRhU3RhdHVzKGNhY2hlS2V5KSA9PT0gJ2Vycm9yJztcbiAgICB9O1xuICB9LFxuXG4gIHN1bTogZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICB2YXIgc3VtID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuICAgICAgICBzdW0gKz0gZmllbGQuZXZhbChhcmdzW2ldLCBjb250ZXh0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdW07XG4gICAgfTtcbiAgfSxcblxuICBmb3JFYWNoOiBmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgcGx1Z2luLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJncywgZmllbGQsIGNvbnRleHQpIHtcbiAgICAgIHZhciBpdGVtTmFtZSA9IGFyZ3NbMF07XG4gICAgICB2YXIgYXJyYXkgPSBmaWVsZC5ldmFsKGFyZ3NbMV0sIGNvbnRleHQpO1xuICAgICAgdmFyIG1hcEV4cHIgPSBhcmdzWzJdO1xuICAgICAgdmFyIGZpbHRlckV4cHIgPSBhcmdzWzNdO1xuICAgICAgY29udGV4dCA9IE9iamVjdC5jcmVhdGUoY29udGV4dCB8fCB7fSk7XG5cbiAgICAgIHZhciByZXN1bHRzID0gW107XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGl0ZW0gPSBhcnJheVtpXTtcbiAgICAgICAgY29udGV4dFtpdGVtTmFtZV0gPSBpdGVtO1xuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChmaWx0ZXJFeHByKSB8fCBmaWVsZC5ldmFsKGZpbHRlckV4cHIsIGNvbnRleHQpKSB7XG4gICAgICAgICAgcmVzdWx0cy5wdXNoKGZpZWxkLmV2YWwobWFwRXhwciwgY29udGV4dCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH07XG4gIH0sXG5cbiAgY29uY2F0OiBtZXRob2RDYWxsKCdjb25jYXQnKSxcbiAgc3BsaXQ6IG1ldGhvZENhbGwoJ3NwbGl0JyksXG4gIHJldmVyc2U6IG1ldGhvZENhbGwoJ3JldmVyc2UnKSxcbiAgam9pbjogbWV0aG9kQ2FsbCgnam9pbicpLFxuXG4gIGh1bWFuaXplOiBmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgdmFyIHV0aWwgPSBwbHVnaW4ucmVxdWlyZSgndXRpbCcpO1xuICAgIHBsdWdpbi5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIGZpZWxkLCBjb250ZXh0KSB7XG4gICAgICByZXR1cm4gdXRpbC5odW1hbml6ZShmaWVsZC5ldmFsKGFyZ3NbMF0sIGNvbnRleHQpKTtcbiAgICB9O1xuICB9LFxuXG4gIHBpY2s6IHdyYXBGbihfLnBpY2spLFxuICBwbHVjazogd3JhcEZuKF8ucGx1Y2spXG59O1xuXG4vLyBCdWlsZCBhIHBsdWdpbiBidW5kbGUuXG5fLmVhY2gocGx1Z2lucywgZnVuY3Rpb24gKGZuLCBuYW1lKSB7XG4gIG1vZHVsZS5leHBvcnRzWydldmFsLWZ1bmN0aW9uLicgKyBuYW1lXSA9IGZuO1xufSk7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgZXZhbFxuXG4vKlxuVGhlIGV2YWwgcGx1Z2luIHdpbGwgZXZhbHVhdGUgYSBmaWVsZCdzIGBldmFsYCBwcm9wZXJ0eSAod2hpY2ggbXVzdCBiZSBhblxub2JqZWN0KSBhbmQgZXhjaGFuZ2UgdGhlIHByb3BlcnRpZXMgb2YgdGhhdCBvYmplY3QgZm9yIHdoYXRldmVyIHRoZVxuZXhwcmVzc2lvbiByZXR1cm5zLiBFeHByZXNzaW9ucyBhcmUganVzdCBKU09OIGV4Y2VwdCBpZiB0aGUgZmlyc3QgZWxlbWVudCBvZlxuYW4gYXJyYXkgaXMgYSBzdHJpbmcgdGhhdCBzdGFydHMgd2l0aCAnQCcuIEluIHRoYXQgY2FzZSwgdGhlIGFycmF5IGlzXG50cmVhdGVkIGFzIGEgTGlzcCBleHByZXNzaW9uIHdoZXJlIHRoZSBmaXJzdCBlbGVtZW50IHJlZmVycyB0byBhIGZ1bmN0aW9uXG50aGF0IGlzIGNhbGxlZCB3aXRoIHRoZSByZXN0IG9mIHRoZSBlbGVtZW50cyBhcyB0aGUgYXJndW1lbnRzLiBGb3IgZXhhbXBsZTpcblxuYGBganNcblsnQHN1bScsIDEsIDJdXG5gYGBcblxud2lsbCByZXR1cm4gdGhlIHZhbHVlIDMuIFRoZSBleHByZXNzaW9uIGNvdWxkIGJlIHVzZWQgaW4gYW4gYGV2YWxgIHByb3BlcnR5IG9mXG5hIGZpZWxkIGxpa2U6XG5cbmBgYGpzXG57XG4gIHR5cGU6ICdzdHJpbmcnLFxuICBrZXk6ICduYW1lJyxcbiAgZXZhbDoge1xuICAgIHJvd3M6IFsnQHN1bScsIDEsIDJdXG4gIH1cbn1cbmBgYFxuXG5UaGUgYHJvd3NgIHByb3BlcnR5IG9mIHRoZSBmaWVsZCB3b3VsZCBiZSBzZXQgdG8gMyBpbiB0aGlzIGNhc2UuXG5cbkFueSBwbHVnaW4gcmVnaXN0ZXJlZCB3aXRoIHRoZSBwcmVmaXggYGV2YWwtZnVuY3Rpb24uYCB3aWxsIGJlIGF2YWlsYWJsZSBhcyBhXG5mdW5jdGlvbiBpbiB0aGVzZSBleHByZXNzaW9ucy5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIC8vIEdyYWIgYWxsIHRoZSBmdW5jdGlvbiBwbHVnaW5zLlxuICB2YXIgZXZhbEZ1bmN0aW9uUGx1Z2lucyA9IHBsdWdpbi5yZXF1aXJlQWxsT2YoJ2V2YWwtZnVuY3Rpb24nKTtcblxuICAvLyBKdXN0IHN0cmlwIG9mZiB0aGUgJ2V2YWwtZnVuY3Rpb25zLicgcHJlZml4IGFuZCBwdXQgaW4gYSBkaWZmZXJlbnQgb2JqZWN0LlxuICB2YXIgZnVuY3Rpb25zID0ge307XG4gIF8uZWFjaChldmFsRnVuY3Rpb25QbHVnaW5zLCBmdW5jdGlvbiAoZm4sIG5hbWUpIHtcbiAgICB2YXIgZm5OYW1lID0gbmFtZS5zdWJzdHJpbmcobmFtZS5pbmRleE9mKCcuJykgKyAxKTtcbiAgICBmdW5jdGlvbnNbZm5OYW1lXSA9IGZuO1xuICB9KTtcblxuICAvLyBDaGVjayBhbiBhcnJheSB0byBzZWUgaWYgaXQncyBhIGZ1bmN0aW9uIGV4cHJlc3Npb24uXG4gIHZhciBpc0Z1bmN0aW9uQXJyYXkgPSBmdW5jdGlvbiAoYXJyYXkpIHtcbiAgICByZXR1cm4gYXJyYXkubGVuZ3RoID4gMCAmJiBhcnJheVswXVswXSA9PT0gJ0AnO1xuICB9O1xuXG4gIC8vIEV2YWx1YXRlIGEgZnVuY3Rpb24gZXhwcmVzc2lvbiBhbmQgcmV0dXJuIHRoZSByZXN1bHQuXG4gIHZhciBldmFsRnVuY3Rpb24gPSBmdW5jdGlvbiAoZm5BcnJheSwgZmllbGQsIGNvbnRleHQpIHtcbiAgICB2YXIgZm5OYW1lID0gZm5BcnJheVswXS5zdWJzdHJpbmcoMSk7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBmdW5jdGlvbnNbZm5OYW1lXShmbkFycmF5LnNsaWNlKDEpLCBmaWVsZCwgY29udGV4dCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKCEoZm5OYW1lIGluIGZ1bmN0aW9ucykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFdmFsIGZ1bmN0aW9uICcgKyBmbk5hbWUgKyAnIG5vdCBkZWZpbmVkLicpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH07XG5cbiAgLy8gRXZhbHVhdGUgYW4gZXhwcmVzc2lvbiBpbiB0aGUgY29udGV4dCBvZiBhIGZpZWxkLlxuICB2YXIgZXZhbHVhdGUgPSBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgZmllbGQsIGNvbnRleHQpIHtcbiAgICBpZiAoXy5pc0FycmF5KGV4cHJlc3Npb24pKSB7XG4gICAgICBpZiAoaXNGdW5jdGlvbkFycmF5KGV4cHJlc3Npb24pKSB7XG4gICAgICAgIHJldHVybiBldmFsRnVuY3Rpb24oZXhwcmVzc2lvbiwgZmllbGQsIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGV4cHJlc3Npb24ubWFwKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgICAgcmV0dXJuIGV2YWx1YXRlKGl0ZW0sIGZpZWxkLCBjb250ZXh0KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChfLmlzT2JqZWN0KGV4cHJlc3Npb24pKSB7XG4gICAgICB2YXIgb2JqID0ge307XG4gICAgICBPYmplY3Qua2V5cyhleHByZXNzaW9uKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGV2YWx1YXRlKGV4cHJlc3Npb25ba2V5XSwgZmllbGQsIGNvbnRleHQpO1xuICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBvYmpba2V5XSA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH0gZWxzZSBpZiAoXy5pc1N0cmluZyhleHByZXNzaW9uKSAmJiBleHByZXNzaW9uWzBdID09PSAnPScpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbnMuZ2V0KFtleHByZXNzaW9uLnN1YnN0cmluZygxKV0sIGZpZWxkLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGV4cHJlc3Npb247XG4gICAgfVxuICB9O1xuXG4gIHBsdWdpbi5leHBvcnRzLmV2YWx1YXRlID0gZXZhbHVhdGU7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIGZpZWxkLXJvdXRlclxuXG4vKlxuRmllbGRzIGFuZCBjb21wb25lbnRzIGdldCBnbHVlZCB0b2dldGhlciB2aWEgcm91dGVzLiBUaGlzIGlzIHNpbWlsYXIgdG8gVVJMXG5yb3V0aW5nIHdoZXJlIGEgcmVxdWVzdCBnZXRzIGR5bmFtaWNhbGx5IHJvdXRlZCB0byBhIGhhbmRsZXIuIFRoaXMgZ2l2ZXMgYSBsb3Rcbm9mIGZsZXhpYmlsaXR5IGluIGludHJvZHVjaW5nIG5ldyB0eXBlcyBhbmQgY29tcG9uZW50cy4gWW91IGNhbiBjcmVhdGUgYSBuZXdcbnR5cGUgYW5kIHJvdXRlIGl0IHRvIGFuIGV4aXN0aW5nIGNvbXBvbmVudCwgb3IgeW91IGNhbiBjcmVhdGUgYSBuZXcgY29tcG9uZW50XG5hbmQgcm91dGUgZXhpc3RpbmcgdHlwZXMgdG8gaXQuIE9yIHlvdSBjYW4gY3JlYXRlIGJvdGggYW5kIHJvdXRlIHRoZSBuZXcgdHlwZVxudG8gdGhlIG5ldyBjb21wb25lbnQuIE5ldyByb3V0ZXMgYXJlIGFkZGVkIHZpYSByb3V0ZSBwbHVnaW5zLiBBIHJvdXRlIHBsdWdpblxuc2ltcGx5IGV4cG9ydHMgYW4gYXJyYXkgbGlrZTpcblxuYGBganNcbltcbiAgJ2NvbG9yJywgLy8gUm91dGUgdGhpcyB0eXBlXG4gICdjb2xvci1waWNrZXItd2l0aC1hbHBoYScsIC8vIFRvIHRoaXMgY29tcG9uZW50XG4gIGZ1bmN0aW9uIChmaWVsZCkge1xuICAgIHJldHVybiB0eXBlb2YgZmllbGQuZGVmLmFscGhhICE9PSAndW5kZWZpbmVkJztcbiAgfVxuXVxuXG5Sb3V0ZSBwbHVnaW5zIGNhbiBiZSBzdGFja2VkIGFuZCBhcmUgc2Vuc2l0aXZlIHRvIG9yZGVyaW5nLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgdmFyIHJvdXRlcyA9IHt9O1xuXG4gIHZhciByb3V0ZXIgPSBwbHVnaW4uZXhwb3J0cztcblxuICAvLyBHZXQgYWxsIHRoZSByb3V0ZSBwbHVnaW5zLlxuICB2YXIgcm91dGVQbHVnaW5zID0gcGx1Z2luLnJlcXVpcmVBbGwocGx1Z2luLmNvbmZpZy5yb3V0ZXMpO1xuXG4gIC8vIFJlZ2lzdGVyIGEgcm91dGUuXG4gIHJvdXRlci5yb3V0ZSA9IGZ1bmN0aW9uICh0eXBlTmFtZSwgY29tcG9uZW50TmFtZSwgdGVzdEZuKSB7XG4gICAgaWYgKCFyb3V0ZXNbdHlwZU5hbWVdKSB7XG4gICAgICByb3V0ZXNbdHlwZU5hbWVdID0gW107XG4gICAgfVxuICAgIHJvdXRlc1t0eXBlTmFtZV0ucHVzaCh7XG4gICAgICBjb21wb25lbnQ6IGNvbXBvbmVudE5hbWUsXG4gICAgICB0ZXN0OiB0ZXN0Rm5cbiAgICB9KTtcbiAgfTtcblxuICAvLyBSZWdpc3RlciBlYWNoIG9mIHRoZSByb3V0ZXMgcHJvdmlkZWQgYnkgdGhlIHJvdXRlIHBsdWdpbnMuXG4gIHJvdXRlUGx1Z2lucy5mb3JFYWNoKGZ1bmN0aW9uIChyb3V0ZVBsdWdpbikge1xuXG4gICAgcm91dGVyLnJvdXRlLmFwcGx5KHJvdXRlciwgcm91dGVQbHVnaW4pO1xuICB9KTtcblxuICAvLyBEZXRlcm1pbmUgdGhlIGJlc3QgY29tcG9uZW50IGZvciBhIGZpZWxkLCBiYXNlZCBvbiB0aGUgcm91dGVzLlxuICByb3V0ZXIuY29tcG9uZW50Rm9yRmllbGQgPSBmdW5jdGlvbiAoZmllbGQpIHtcblxuICAgIHZhciB0eXBlTmFtZSA9IGZpZWxkLmRlZi50eXBlO1xuXG4gICAgaWYgKHJvdXRlc1t0eXBlTmFtZV0pIHtcbiAgICAgIHZhciByb3V0ZXNGb3JUeXBlID0gcm91dGVzW3R5cGVOYW1lXTtcbiAgICAgIHZhciByb3V0ZSA9IF8uZmluZChyb3V0ZXNGb3JUeXBlLCBmdW5jdGlvbiAocm91dGUpIHtcbiAgICAgICAgcmV0dXJuICFyb3V0ZS50ZXN0IHx8IHJvdXRlLnRlc3QoZmllbGQpO1xuICAgICAgfSk7XG4gICAgICBpZiAocm91dGUpIHtcbiAgICAgICAgcmV0dXJuIHBsdWdpbi5jb21wb25lbnQocm91dGUuY29tcG9uZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocGx1Z2luLmhhc0NvbXBvbmVudCh0eXBlTmFtZSkpIHtcbiAgICAgIHJldHVybiBwbHVnaW4uY29tcG9uZW50KHR5cGVOYW1lKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGNvbXBvbmVudCBmb3IgZmllbGQ6ICcgKyBKU09OLnN0cmluZ2lmeShmaWVsZC5kZWYpKTtcbiAgfTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgZmllbGQtcm91dGVzXG5cbi8qXG5EZWZhdWx0IHJvdXRlcy4gRWFjaCByb3V0ZSBpcyBwYXJ0IG9mIGl0cyBvd24gcGx1Z2luLCBidXQgYWxsIGFyZSBrZXB0IHRvZ2V0aGVyXG5oZXJlIGFzIHBhcnQgb2YgYSBwbHVnaW4gYnVuZGxlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcblxudmFyIHJvdXRlcyA9IHtcblxuICAnb2JqZWN0LnN0YXRpYyc6IFtcbiAgICAnb2JqZWN0JyxcbiAgICAnZmllbGRzZXQnLFxuICAgIGZ1bmN0aW9uIChmaWVsZCkge1xuICAgICAgcmV0dXJuIGZpZWxkLmRlZi5zdGF0aWNLZXlzO1xuICAgIH1cbiAgXSxcblxuICAnb2JqZWN0LmRlZmF1bHQnOiBbXG4gICAgJ29iamVjdCcsXG4gICAgJ29iamVjdCdcbiAgXSxcblxuICAnc3RyaW5nLmNob2ljZXMnOiBbXG4gICAgJ3N0cmluZycsXG4gICAgJ3NlbGVjdCcsXG4gICAgZnVuY3Rpb24gKGZpZWxkKSB7XG4gICAgICByZXR1cm4gZmllbGQuZGVmLmNob2ljZXMgPyB0cnVlIDogZmFsc2U7XG4gICAgfVxuICBdLFxuXG4gICdzdHJpbmcudGFncyc6IFtcbiAgICAnc3RyaW5nJyxcbiAgICAncHJldHR5LXRleHRhcmVhJyxcbiAgICBmdW5jdGlvbiAoZmllbGQpIHtcbiAgICAgIHJldHVybiBmaWVsZC5kZWYucmVwbGFjZUNob2ljZXM7XG4gICAgfVxuICBdLFxuXG4gICdzdHJpbmcuc2luZ2xlLWxpbmUnOiBbXG4gICAgJ3N0cmluZycsXG4gICAgJ3RleHQnLFxuICAgIGZ1bmN0aW9uIChmaWVsZCkge1xuICAgICAgcmV0dXJuIGZpZWxkLmRlZi5tYXhSb3dzID09PSAxO1xuICAgIH1cbiAgXSxcblxuICAvLyBOb3Qgc3VyZSB3aGF0IHRvIGRvIHdpdGggbnVsbHMuXG4gICdudWxsLmRlZmF1bHQnOiBbXG4gICAgJ251bGwnLFxuICAgICd0ZXh0YXJlYSdcbiAgXSxcblxuICAnc3RyaW5nLmRlZmF1bHQnOiBbXG4gICAgJ3N0cmluZycsXG4gICAgJ3RleHRhcmVhJ1xuICBdLFxuXG4gICdhcnJheS5jaG9pY2VzJzogW1xuICAgICdhcnJheScsXG4gICAgJ2NoZWNrYm94LWxpc3QnLFxuICAgIGZ1bmN0aW9uIChmaWVsZCkge1xuICAgICAgcmV0dXJuIGZpZWxkLmRlZi5jaG9pY2VzID8gdHJ1ZSA6IGZhbHNlO1xuICAgIH1cbiAgXSxcblxuICAnYXJyYXkuZGVmYXVsdCc6IFtcbiAgICAnYXJyYXknLFxuICAgICdsaXN0J1xuICBdLFxuXG4gICdib29sZWFuLmRlZmF1bHQnOiBbXG4gICAgJ2Jvb2xlYW4nLFxuICAgICdzZWxlY3QnXG4gIF0sXG5cbiAgJ251bWJlci5kZWZhdWx0JzogW1xuICAgICdudW1iZXInLFxuICAgICd0ZXh0J1xuICBdXG5cbn07XG5cbi8vIEJ1aWxkIGEgcGx1Z2luIGJ1bmRsZS5cbl8uZWFjaChyb3V0ZXMsIGZ1bmN0aW9uIChyb3V0ZSwgbmFtZSkge1xuICBtb2R1bGUuZXhwb3J0c1snZmllbGQtcm91dGUuJyArIG5hbWVdID0gZnVuY3Rpb24gKHBsdWdpbikge1xuICAgIHBsdWdpbi5leHBvcnRzID0gcm91dGU7XG4gIH07XG59KTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gIyBsb2FkZXJcblxuLypcbldoZW4gbWV0YWRhdGEgaXNuJ3QgYXZhaWxhYmxlLCB3ZSBhc2sgdGhlIGxvYWRlciB0byBsb2FkIGl0LiBUaGUgbG9hZGVyIHdpbGxcbnRyeSB0byBmaW5kIGFuIGFwcHJvcHJpYXRlIHNvdXJjZSBiYXNlZCBvbiB0aGUgbWV0YWRhdGEga2V5cy5cblxuTm90ZSB0aGF0IHdlIGFzayB0aGUgbG9hZGVyIHRvIGxvYWQgbWV0YWRhdGEgd2l0aCBhIHNldCBvZiBrZXlzIGxpa2VcbmBbJ2ZvbycsICdiYXInXWAsIGJ1dCB0aG9zZSBhcmUgY29udmVydGVkIHRvIGEgc2luZ2xlIGtleSBsaWtlIGBmb286OmJhcmAgZm9yXG50aGUgc2FrZSBvZiBjYWNoaW5nLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG5cbiAgdmFyIGxvYWRlciA9IHBsdWdpbi5leHBvcnRzO1xuXG4gIHZhciBpc0xvYWRpbmcgPSB7fTtcbiAgdmFyIHNvdXJjZXMgPSB7fTtcblxuICAvLyBMb2FkIG1ldGFkYXRhIGZvciBhIGdpdmVuIGZvcm0gYW5kIHBhcmFtcy5cbiAgbG9hZGVyLmxvYWRNZXRhID0gZnVuY3Rpb24gKGZvcm0sIHNvdXJjZSwgcGFyYW1zKSB7XG4gICAgdmFyIGNhY2hlS2V5ID0gdXRpbC5tZXRhQ2FjaGVLZXkoc291cmNlLCBwYXJhbXMpO1xuXG4gICAgaWYgKGlzTG9hZGluZ1tjYWNoZUtleV0pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc0xvYWRpbmdbY2FjaGVLZXldID0gdHJ1ZTtcblxuICAgIGxvYWRlci5sb2FkQXN5bmNGcm9tU291cmNlKGZvcm0sIHNvdXJjZSwgcGFyYW1zKTtcbiAgfTtcblxuICAvLyBNYWtlIHN1cmUgdG8gbG9hZCBtZXRhZGF0YSBhc3luY2hyb25vdXNseS5cbiAgbG9hZGVyLmxvYWRBc3luY0Zyb21Tb3VyY2UgPSBmdW5jdGlvbiAoZm9ybSwgc291cmNlLCBwYXJhbXMsIHdhaXRUaW1lKSB7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICBsb2FkZXIubG9hZEZyb21Tb3VyY2UoZm9ybSwgc291cmNlLCBwYXJhbXMpO1xuICAgIH0sIHdhaXRUaW1lIHx8IDApO1xuICB9O1xuXG4gIC8vIExvYWQgbWV0YWRhdGEgZm9yIGEgZm9ybSBhbmQgcGFyYW1zLlxuICBsb2FkZXIubG9hZEZyb21Tb3VyY2UgPSBmdW5jdGlvbiAoZm9ybSwgc291cmNlTmFtZSwgcGFyYW1zKSB7XG5cbiAgICAvLyBGaW5kIHRoZSBiZXN0IHNvdXJjZSBmb3IgdGhpcyBjYWNoZSBrZXkuXG4gICAgdmFyIHNvdXJjZSA9IHNvdXJjZXNbc291cmNlTmFtZV07XG4gICAgaWYgKHNvdXJjZSkge1xuXG4gICAgICB2YXIgY2FjaGVLZXkgPSB1dGlsLm1ldGFDYWNoZUtleShzb3VyY2VOYW1lLCBwYXJhbXMpO1xuXG4gICAgICAvLyBDYWxsIHRoZSBzb3VyY2UgZnVuY3Rpb24uXG4gICAgICB2YXIgcmVzdWx0ID0gc291cmNlLmNhbGwobnVsbCwgcGFyYW1zKTtcblxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAvLyBSZXN1bHQgY291bGQgYmUgYSBwcm9taXNlLlxuICAgICAgICBpZiAocmVzdWx0LnRoZW4pIHtcbiAgICAgICAgICB2YXIgcHJvbWlzZSA9IHJlc3VsdC50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIGZvcm0ubWV0YShjYWNoZUtleSwgcmVzdWx0KTtcbiAgICAgICAgICAgIGlzTG9hZGluZ1tjYWNoZUtleV0gPSBmYWxzZTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHZhciBvbkVycm9yID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZm9ybS5tZXRhKGNhY2hlS2V5LCBudWxsLCAnZXJyb3InKTtcbiAgICAgICAgICAgIGlzTG9hZGluZ1tjYWNoZUtleV0gPSBmYWxzZTtcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgaWYgKHByb21pc2UuY2F0Y2gpIHtcbiAgICAgICAgICAgIHByb21pc2UuY2F0Y2gob25FcnJvcik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIHNpbGx5IGpRdWVyeSBwcm9taXNlc1xuICAgICAgICAgICAgcHJvbWlzZS5mYWlsKG9uRXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgLy8gT3IgaXQgY291bGQgYmUgYSB2YWx1ZS4gSW4gdGhhdCBjYXNlLCBtYWtlIHN1cmUgdG8gYXN5bmNpZnkgaXQuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBmb3JtLm1ldGEoY2FjaGVLZXksIHJlc3VsdCk7XG4gICAgICAgICAgICBpc0xvYWRpbmdbY2FjaGVLZXldID0gZmFsc2U7XG4gICAgICAgICAgfSwgMCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlzTG9hZGluZ1tjYWNoZUtleV0gPSBmYWxzZTtcbiAgICAgIH1cblxuICAgIH0gZWxzZSB7XG4gICAgICBpc0xvYWRpbmdbY2FjaGVLZXldID0gZmFsc2U7XG4gICAgfVxuICB9O1xuXG4gIC8vIFJlZ2lzdGVyIGEgc291cmNlIGZ1bmN0aW9uLlxuICBsb2FkZXIuc291cmNlID0gZnVuY3Rpb24gKG5hbWUsIGZuKSB7XG5cbiAgICBzb3VyY2VzW25hbWVdID0gZm47XG4gIH07XG5cbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIHV0aWxcblxuLy8gU29tZSB1dGlsaXR5IGZ1bmN0aW9ucyB0byBiZSB1c2VkIGJ5IG90aGVyIHBsdWdpbnMuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHZhciB1dGlsID0gcGx1Z2luLmV4cG9ydHM7XG5cbiAgLy8gQ2hlY2sgaWYgYSB2YWx1ZSBpcyBcImJsYW5rXCIuXG4gIHV0aWwuaXNCbGFuayA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSAnJztcbiAgfTtcblxuICAvLyBTZXQgdmFsdWUgYXQgc29tZSBwYXRoIGluIG9iamVjdC5cbiAgdXRpbC5zZXRJbiA9IGZ1bmN0aW9uIChvYmosIHBhdGgsIHZhbHVlKSB7XG4gICAgaWYgKF8uaXNTdHJpbmcocGF0aCkpIHtcbiAgICAgIHBhdGggPSBbcGF0aF07XG4gICAgfVxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDEpIHtcbiAgICAgIG9ialtwYXRoWzBdXSA9IHZhbHVlO1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gICAgaWYgKCFvYmpbcGF0aFswXV0pIHtcbiAgICAgIG9ialtwYXRoWzBdXSA9IHt9O1xuICAgIH1cbiAgICB1dGlsLnNldEluKG9ialtwYXRoWzBdXSwgcGF0aC5zbGljZSgxKSwgdmFsdWUpO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmVtb3ZlIHZhbHVlIGF0IHBhdGggaW4gc29tZSBvYmplY3QuXG4gIHV0aWwucmVtb3ZlSW4gPSBmdW5jdGlvbiAob2JqLCBwYXRoKSB7XG4gICAgaWYgKF8uaXNTdHJpbmcocGF0aCkpIHtcbiAgICAgIHBhdGggPSBbcGF0aF07XG4gICAgfVxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMSkge1xuICAgICAgaWYgKF8uaXNBcnJheShvYmopKSB7XG4gICAgICAgIGlmIChfLmlzTnVtYmVyKHBhdGhbMF0pKSB7XG4gICAgICAgICAgb2JqLnNwbGljZShwYXRoWzBdLCAxKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChfLmlzT2JqZWN0KG9iaikpIHtcbiAgICAgICAgZGVsZXRlIG9ialtwYXRoWzBdXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICAgIGlmIChvYmpbcGF0aFswXV0pIHtcbiAgICAgIHV0aWwucmVtb3ZlSW4ob2JqW3BhdGhbMF1dLCBwYXRoLnNsaWNlKDEpKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBHZXQgdmFsdWUgYXQgcGF0aCBpbiBzb21lIG9iamVjdC5cbiAgdXRpbC5nZXRJbiA9IGZ1bmN0aW9uIChvYmosIHBhdGgpIHtcbiAgICBpZiAoXy5pc1N0cmluZyhwYXRoKSkge1xuICAgICAgcGF0aCA9IFtwYXRoXTtcbiAgICB9XG4gICAgaWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH1cbiAgICBpZiAoXy5pc09iamVjdChvYmopICYmIHBhdGhbMF0gaW4gb2JqKSB7XG4gICAgICByZXR1cm4gdXRpbC5nZXRJbihvYmpbcGF0aFswXV0sIHBhdGguc2xpY2UoMSkpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICAvLyBBcHBlbmQgdG8gYXJyYXkgYXQgcGF0aCBpbiBzb21lIG9iamVjdC5cbiAgdXRpbC5hcHBlbmRJbiA9IGZ1bmN0aW9uIChvYmosIHBhdGgsIHZhbHVlKSB7XG4gICAgdmFyIHN1Yk9iaiA9IHV0aWwuZ2V0SW4ob2JqLCBwYXRoKTtcbiAgICBpZiAoXy5pc0FycmF5KHN1Yk9iaikpIHtcbiAgICAgIHN1Yk9iai5wdXNoKHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBTd2FwIHR3byBrZXlzIGF0IHBhdGggaW4gc29tZSBvYmplY3QuXG4gIHV0aWwubW92ZUluID0gZnVuY3Rpb24gKG9iaiwgcGF0aCwgZnJvbUtleSwgdG9LZXkpIHtcbiAgICB2YXIgc3ViT2JqID0gdXRpbC5nZXRJbihvYmosIHBhdGgpO1xuICAgIGlmIChfLmlzQXJyYXkoc3ViT2JqKSkge1xuICAgICAgaWYgKF8uaXNOdW1iZXIoZnJvbUtleSkgJiYgXy5pc051bWJlcih0b0tleSkpIHtcbiAgICAgICAgdmFyIGZyb21JbmRleCA9IGZyb21LZXk7XG4gICAgICAgIHZhciB0b0luZGV4ID0gdG9LZXk7XG4gICAgICAgIGlmIChmcm9tSW5kZXggIT09IHRvSW5kZXggJiZcbiAgICAgICAgICBmcm9tSW5kZXggPj0gMCAmJiBmcm9tSW5kZXggPCBzdWJPYmoubGVuZ3RoICYmXG4gICAgICAgICAgdG9JbmRleCA+PSAwICYmIHRvSW5kZXggPCBzdWJPYmoubGVuZ3RoXG4gICAgICAgICkge1xuICAgICAgICAgIHN1Yk9iai5zcGxpY2UodG9JbmRleCwgMCwgc3ViT2JqLnNwbGljZShmcm9tSW5kZXgsIDEpWzBdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdWJPYmpbdG9LZXldID0gc3ViT2JqW2Zyb21LZXldO1xuICAgICAgZGVsZXRlIHN1Yk9ialtmcm9tS2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBDb3B5IG9iaiwgbGVhdmluZyBub24tSlNPTiBiZWhpbmQuXG4gIHV0aWwuY29weVZhbHVlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTtcbiAgfTtcblxuICAvLyBDb3B5IG9iaiByZWN1cnNpbmcgZGVlcGx5LlxuICB1dGlsLmRlZXBDb3B5ID0gZnVuY3Rpb24gKG9iaikge1xuICAgIGlmIChfLmlzQXJyYXkob2JqKSkge1xuICAgICAgcmV0dXJuIG9iai5tYXAoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIHV0aWwuZGVlcENvcHkoaXRlbSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKF8uaXNPYmplY3Qob2JqKSkge1xuICAgICAgdmFyIGNvcHkgPSB7fTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgICAgIGNvcHlba2V5XSA9IHV0aWwuZGVlcENvcHkodmFsdWUpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gY29weTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gIH07XG5cbiAgLy8gQ2hlY2sgaWYgaXRlbSBtYXRjaGVzIHNvbWUgdmFsdWUsIGJhc2VkIG9uIHRoZSBpdGVtJ3MgYG1hdGNoYCBwcm9wZXJ0eS5cbiAgdXRpbC5pdGVtTWF0Y2hlc1ZhbHVlID0gZnVuY3Rpb24gKGl0ZW0sIHZhbHVlKSB7XG4gICAgdmFyIG1hdGNoID0gaXRlbS5tYXRjaDtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIF8uZXZlcnkoXy5rZXlzKG1hdGNoKSwgZnVuY3Rpb24gKGtleSkge1xuICAgICAgcmV0dXJuIF8uaXNFcXVhbChtYXRjaFtrZXldLCB2YWx1ZVtrZXldKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSBmaWVsZCBkZWZpbml0aW9uIGZyb20gYSB2YWx1ZS5cbiAgdXRpbC5maWVsZERlZkZyb21WYWx1ZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHZhciBkZWYgPSB7XG4gICAgICB0eXBlOiAnanNvbidcbiAgICB9O1xuICAgIGlmIChfLmlzU3RyaW5nKHZhbHVlKSkge1xuICAgICAgZGVmID0ge1xuICAgICAgICB0eXBlOiAnc3RyaW5nJ1xuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKF8uaXNOdW1iZXIodmFsdWUpKSB7XG4gICAgICBkZWYgPSB7XG4gICAgICAgIHR5cGU6ICdudW1iZXInXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXy5pc0Jvb2xlYW4odmFsdWUpKSB7XG4gICAgICBkZWYgPSB7XG4gICAgICAgIHR5cGU6ICdib29sZWFuJ1xuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKF8uaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIHZhciBhcnJheUl0ZW1GaWVsZHMgPSB2YWx1ZS5tYXAoZnVuY3Rpb24gKHZhbHVlLCBpKSB7XG4gICAgICAgIHZhciBjaGlsZERlZiA9IHV0aWwuZmllbGREZWZGcm9tVmFsdWUodmFsdWUpO1xuICAgICAgICBjaGlsZERlZi5rZXkgPSBpO1xuICAgICAgICByZXR1cm4gY2hpbGREZWY7XG4gICAgICB9KTtcbiAgICAgIGRlZiA9IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgZmllbGRzOiBhcnJheUl0ZW1GaWVsZHNcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChfLmlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgdmFyIG9iamVjdEl0ZW1GaWVsZHMgPSBPYmplY3Qua2V5cyh2YWx1ZSkubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdmFyIGNoaWxkRGVmID0gdXRpbC5maWVsZERlZkZyb21WYWx1ZSh2YWx1ZVtrZXldKTtcbiAgICAgICAgY2hpbGREZWYua2V5ID0ga2V5O1xuICAgICAgICBjaGlsZERlZi5sYWJlbCA9IHV0aWwuaHVtYW5pemUoa2V5KTtcbiAgICAgICAgcmV0dXJuIGNoaWxkRGVmO1xuICAgICAgfSk7XG4gICAgICBkZWYgPSB7XG4gICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICBmaWVsZHM6IG9iamVjdEl0ZW1GaWVsZHNcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChfLmlzTnVsbCh2YWx1ZSkpIHtcbiAgICAgIGRlZiA9IHtcbiAgICAgICAgdHlwZTogJ251bGwnXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gZGVmO1xuICB9O1xuXG4gIGlmIChwbHVnaW4uY29uZmlnLmh1bWFuaXplKSB7XG4gICAgLy8gR2V0IHRoZSBodW1hbml6ZSBmdW5jdGlvbiBmcm9tIGEgcGx1Z2luIGlmIHByb3ZpZGVkLlxuICAgIHV0aWwuaHVtYW5pemUgPSBwbHVnaW4ucmVxdWlyZShwbHVnaW4uY29uZmlnLmh1bWFuaXplKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBDb252ZXJ0IHByb3BlcnR5IGtleXMgdG8gXCJodW1hblwiIGxhYmVscy4gRm9yIGV4YW1wbGUsICdmb28nIGJlY29tZXNcbiAgICAvLyAnRm9vJy5cbiAgICB1dGlsLmh1bWFuaXplID0gZnVuY3Rpb24ocHJvcGVydHkpIHtcbiAgICAgIHByb3BlcnR5ID0gcHJvcGVydHkucmVwbGFjZSgvXFx7XFx7L2csICcnKTtcbiAgICAgIHByb3BlcnR5ID0gcHJvcGVydHkucmVwbGFjZSgvXFx9XFx9L2csICcnKTtcbiAgICAgIHJldHVybiBwcm9wZXJ0eS5yZXBsYWNlKC9fL2csICcgJylcbiAgICAgICAgLnJlcGxhY2UoLyhcXHcrKS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICAgIHJldHVybiBtYXRjaC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG1hdGNoLnNsaWNlKDEpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICB9XG5cbiAgLy8gSm9pbiBtdWx0aXBsZSBDU1MgY2xhc3MgbmFtZXMgdG9nZXRoZXIsIGlnbm9yaW5nIGFueSB0aGF0IGFyZW4ndCB0aGVyZS5cbiAgdXRpbC5jbGFzc05hbWUgPSBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgY2xhc3NOYW1lcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG5cbiAgICBjbGFzc05hbWVzID0gY2xhc3NOYW1lcy5maWx0ZXIoZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJldHVybiBuYW1lO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNsYXNzTmFtZXMuam9pbignICcpO1xuICB9O1xuXG4gIC8vIEpvaW4ga2V5cyB0b2dldGhlciB0byBtYWtlIHNpbmdsZSBcIm1ldGFcIiBrZXkuIEZvciBsb29raW5nIHVwIG1ldGFkYXRhIGluXG4gIC8vIHRoZSBtZXRhZGF0YSBwYXJ0IG9mIHRoZSBzdG9yZS5cbiAgdXRpbC5qb2luTWV0YUtleXMgPSBmdW5jdGlvbiAoa2V5cykge1xuICAgIHJldHVybiBrZXlzLmpvaW4oJzo6Jyk7XG4gIH07XG5cbiAgLy8gU3BsaXQgYSBqb2luZWQga2V5IGludG8gc2VwYXJhdGUga2V5IHBhcnRzLlxuICB1dGlsLnNwbGl0TWV0YUtleSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4ga2V5LnNwbGl0KCc6OicpO1xuICB9O1xuXG4gIHV0aWwubWV0YUNhY2hlS2V5ID0gZnVuY3Rpb24gKHNvdXJjZSwgcGFyYW1zKSB7XG4gICAgcGFyYW1zID0gcGFyYW1zIHx8IHt9O1xuICAgIHJldHVybiBzb3VyY2UgKyAnOjpwYXJhbXMoJyArIEpTT04uc3RyaW5naWZ5KHBhcmFtcykgKyAnKSc7XG4gIH07XG5cbiAgdXRpbC5tZXRhRXJyb3JDYWNoZUtleSA9IGZ1bmN0aW9uIChzb3VyY2UsIHBhcmFtcykge1xuICAgIHBhcmFtcyA9IHBhcmFtcyB8fCB7fTtcbiAgICByZXR1cm4gc291cmNlICsgJzo6cGFyYW1zKCcgKyBKU09OLnN0cmluZ2lmeShwYXJhbXMpICsgJyk6OmVycm9yJztcbiAgfTtcblxuICAvLyBXcmFwIGEgdGV4dCB2YWx1ZSBzbyBpdCBoYXMgYSB0eXBlLiBGb3IgcGFyc2luZyB0ZXh0IHdpdGggdGFncy5cbiAgdmFyIHRleHRQYXJ0ID0gZnVuY3Rpb24gKHZhbHVlLCB0eXBlKSB7XG4gICAgdHlwZSA9IHR5cGUgfHwgJ3RleHQnO1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiB0eXBlLFxuICAgICAgdmFsdWU6IHZhbHVlXG4gICAgfTtcbiAgfTtcblxuICAvLyBQYXJzZSB0ZXh0IHRoYXQgaGFzIHRhZ3MgbGlrZSB7e3RhZ319IGludG8gdGV4dCBhbmQgdGFncy5cbiAgdXRpbC5wYXJzZVRleHRXaXRoVGFncyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHZhbHVlID0gdmFsdWUgfHwgJyc7XG4gICAgdmFyIHBhcnRzID0gdmFsdWUuc3BsaXQoL3t7KD8heykvKTtcbiAgICB2YXIgZnJvbnRQYXJ0ID0gW107XG4gICAgaWYgKHBhcnRzWzBdICE9PSAnJykge1xuICAgICAgZnJvbnRQYXJ0ID0gW1xuICAgICAgICB0ZXh0UGFydChwYXJ0c1swXSlcbiAgICAgIF07XG4gICAgfVxuICAgIHBhcnRzID0gZnJvbnRQYXJ0LmNvbmNhdChcbiAgICAgIHBhcnRzLnNsaWNlKDEpLm1hcChmdW5jdGlvbiAocGFydCkge1xuICAgICAgICBpZiAocGFydC5pbmRleE9mKCd9fScpID49IDApIHtcbiAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgdGV4dFBhcnQocGFydC5zdWJzdHJpbmcoMCwgcGFydC5pbmRleE9mKCd9fScpKSwgJ3RhZycpLFxuICAgICAgICAgICAgdGV4dFBhcnQocGFydC5zdWJzdHJpbmcocGFydC5pbmRleE9mKCd9fScpICsgMikpXG4gICAgICAgICAgXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdGV4dFBhcnQoJ3t7JyArIHBhcnQsICd0ZXh0Jyk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgICByZXR1cm4gW10uY29uY2F0LmFwcGx5KFtdLCBwYXJ0cyk7XG4gIH07XG5cbiAgLy8gQ29weSBhbGwgY29tcHV0ZWQgc3R5bGVzIGZyb20gb25lIERPTSBlbGVtZW50IHRvIGFub3RoZXIuXG4gIHV0aWwuY29weUVsZW1lbnRTdHlsZSA9IGZ1bmN0aW9uIChmcm9tRWxlbWVudCwgdG9FbGVtZW50KSB7XG4gICAgdmFyIGZyb21TdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGZyb21FbGVtZW50LCAnJyk7XG5cbiAgICBpZiAoZnJvbVN0eWxlLmNzc1RleHQgIT09ICcnKSB7XG4gICAgICB0b0VsZW1lbnQuc3R5bGUuY3NzVGV4dCA9IGZyb21TdHlsZS5jc3NUZXh0O1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBjc3NSdWxlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZnJvbVN0eWxlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAvL2NvbnNvbGUubG9nKGksIGZyb21TdHlsZVtpXSwgZnJvbVN0eWxlLmdldFByb3BlcnR5VmFsdWUoZnJvbVN0eWxlW2ldKSlcbiAgICAgIC8vdG9FbGVtZW50LnN0eWxlW2Zyb21TdHlsZVtpXV0gPSBmcm9tU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShmcm9tU3R5bGVbaV0pO1xuICAgICAgY3NzUnVsZXMucHVzaChmcm9tU3R5bGVbaV0gKyAnOicgKyBmcm9tU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShmcm9tU3R5bGVbaV0pICsgJzsnKTtcbiAgICB9XG4gICAgdmFyIGNzc1RleHQgPSBjc3NSdWxlcy5qb2luKCcnKTtcblxuICAgIHRvRWxlbWVudC5zdHlsZS5jc3NUZXh0ID0gY3NzVGV4dDtcbiAgfTtcblxuICAvLyBPYmplY3QgdG8gaG9sZCBicm93c2VyIHNuaWZmaW5nIGluZm8uXG4gIHZhciBicm93c2VyID0ge1xuICAgIGlzQ2hyb21lOiBmYWxzZSxcbiAgICBpc01vemlsbGE6IGZhbHNlLFxuICAgIGlzT3BlcmE6IGZhbHNlLFxuICAgIGlzSWU6IGZhbHNlLFxuICAgIGlzU2FmYXJpOiBmYWxzZVxuICB9O1xuXG4gIC8vIFNuaWZmIHRoZSBicm93c2VyLlxuICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICBpZih1YS5pbmRleE9mKCdDaHJvbWUnKSA+IC0xKSB7XG4gICAgYnJvd3Nlci5pc0Nocm9tZSA9IHRydWU7XG4gIH0gZWxzZSBpZiAodWEuaW5kZXhPZignU2FmYXJpJykgPiAtMSkge1xuICAgIGJyb3dzZXIuaXNTYWZhcmkgPSB0cnVlO1xuICB9IGVsc2UgaWYgKHVhLmluZGV4T2YoJ09wZXJhJykgPiAtMSkge1xuICAgIGJyb3dzZXIuaXNPcGVyYSA9IHRydWU7XG4gIH0gZWxzZSBpZiAodWEuaW5kZXhPZignRmlyZWZveCcpID4gLTEpIHtcbiAgICBicm93c2VyLmlzTW96aWxsYSA9IHRydWU7XG4gIH0gZWxzZSBpZiAodWEuaW5kZXhPZignTVNJRScpID4gLTEpIHtcbiAgICBicm93c2VyLmlzSWUgPSB0cnVlO1xuICB9XG5cbiAgdXRpbC5icm93c2VyID0gYnJvd3NlcjtcblxufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgUmVhY3QgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5SZWFjdCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuUmVhY3QgOiBudWxsKTtcbnZhciBSID0gUmVhY3QuRE9NO1xudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbi8vICMgRm9ybWF0aWMgcGx1Z2luIGNvcmVcblxuLy8gQXQgaXRzIGNvcmUsIEZvcm1hdGljIGlzIGp1c3QgYSBwbHVnaW4gaG9zdC4gQWxsIG9mIHRoZSBmdW5jdGlvbmFsaXR5IGl0IGhhc1xuLy8gb3V0IG9mIHRoZSBib3ggaXMgdmlhIHBsdWdpbnMuIFRoZXNlIHBsdWdpbnMgY2FuIGJlIHJlcGxhY2VkIG9yIGV4dGVuZGVkIGJ5XG4vLyBvdGhlciBwbHVnaW5zLlxuXG4vLyBUaGUgZ2xvYmFsIHBsdWdpbiByZWdpc3RyeSBob2xkcyByZWdpc3RlcmVkIChidXQgbm90IHlldCBpbnN0YW50aWF0ZWQpXG4vLyBwbHVnaW5zLlxudmFyIHBsdWdpblJlZ2lzdHJ5ID0ge307XG5cbi8vIEdyb3VwIHBsdWdpbnMgYnkgcHJlZml4LlxudmFyIHBsdWdpbkdyb3VwcyA9IHt9O1xuXG4vLyBGb3IgYW5vbnltb3VzIHBsdWdpbnMsIGluY3JlbWVudGluZyBudW1iZXIgZm9yIG5hbWVzLlxudmFyIHBsdWdpbklkID0gMDtcblxuLy8gUmVnaXN0ZXIgYSBwbHVnaW4gb3IgcGx1Z2luIGJ1bmRsZSAoYXJyYXkgb2YgcGx1Z2lucykgZ2xvYmFsbHkuXG52YXIgcmVnaXN0ZXJQbHVnaW4gPSBmdW5jdGlvbiAobmFtZSwgcGx1Z2luSW5pdEZuKSB7XG5cbiAgaWYgKHBsdWdpblJlZ2lzdHJ5W25hbWVdKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdQbHVnaW4gJyArIG5hbWUgKyAnIGlzIGFscmVhZHkgcmVnaXN0ZXJlZC4nKTtcbiAgfVxuXG4gIGlmIChfLmlzQXJyYXkocGx1Z2luSW5pdEZuKSkge1xuICAgIHBsdWdpblJlZ2lzdHJ5W25hbWVdID0gW107XG4gICAgcGx1Z2luSW5pdEZuLmZvckVhY2goZnVuY3Rpb24gKHBsdWdpblNwZWMpIHtcbiAgICAgIHJlZ2lzdGVyUGx1Z2luKHBsdWdpblNwZWMubmFtZSwgcGx1Z2luU3BlYy5wbHVnaW4pO1xuICAgICAgcGx1Z2luUmVnaXN0cnlbbmFtZV0ucHVzaChwbHVnaW5TcGVjLm5hbWUpO1xuICAgIH0pO1xuICB9IGVsc2UgaWYgKF8uaXNPYmplY3QocGx1Z2luSW5pdEZuKSAmJiAhXy5pc0Z1bmN0aW9uKHBsdWdpbkluaXRGbikpIHtcbiAgICB2YXIgYnVuZGxlTmFtZSA9IG5hbWU7XG4gICAgcGx1Z2luUmVnaXN0cnlbYnVuZGxlTmFtZV0gPSBbXTtcbiAgICBPYmplY3Qua2V5cyhwbHVnaW5Jbml0Rm4pLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIHJlZ2lzdGVyUGx1Z2luKG5hbWUsIHBsdWdpbkluaXRGbltuYW1lXSk7XG4gICAgICBwbHVnaW5SZWdpc3RyeVtidW5kbGVOYW1lXS5wdXNoKG5hbWUpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHBsdWdpblJlZ2lzdHJ5W25hbWVdID0gcGx1Z2luSW5pdEZuO1xuICAgIC8vIEFkZCBwbHVnaW4gbmFtZSB0byBwbHVnaW4gZ3JvdXAgaWYgaXQgaGFzIGEgcHJlZml4LlxuICAgIGlmIChuYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIHZhciBwcmVmaXggPSBuYW1lLnN1YnN0cmluZygwLCBuYW1lLmluZGV4T2YoJy4nKSk7XG4gICAgICBwbHVnaW5Hcm91cHNbcHJlZml4XSA9IHBsdWdpbkdyb3Vwc1twcmVmaXhdIHx8IFtdO1xuICAgICAgcGx1Z2luR3JvdXBzW3ByZWZpeF0ucHVzaChuYW1lKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIERlZmF1bHQgcGx1Z2luIGNvbmZpZy4gRWFjaCBrZXkgcmVwcmVzZW50cyBhIHBsdWdpbiBuYW1lLiBFYWNoIGtleSBvZiB0aGF0XG4vLyBwbHVnaW4gcmVwcmVzZW50cyBhIHNldHRpbmcgZm9yIHRoYXQgcGx1Z2luLiBQYXNzZWQtaW4gY29uZmlnIHdpbGwgb3ZlcnJpZGVcbi8vIGVhY2ggaW5kaXZpZHVhbCBzZXR0aW5nLlxudmFyIGRlZmF1bHRQbHVnaW5Db25maWcgPSB7XG4gIGNvcmU6IHtcbiAgICBmb3JtYXRpYzogWydjb3JlLmZvcm1hdGljJ10sXG4gICAgZm9ybTogWydjb3JlLmZvcm0taW5pdCcsICdjb3JlLmZvcm0nLCAnY29yZS5maWVsZCddXG4gIH0sXG4gICdjb3JlLmZvcm0nOiB7XG4gICAgc3RvcmU6ICdzdG9yZS5tZW1vcnknXG4gIH0sXG4gICdmaWVsZC1yb3V0ZXInOiB7XG4gICAgcm91dGVzOiBbJ2ZpZWxkLXJvdXRlcyddXG4gIH0sXG4gIGNvbXBpbGVyOiB7XG4gICAgY29tcGlsZXJzOiBbJ2NvbXBpbGVyLmNob2ljZXMnLCAnY29tcGlsZXIubG9va3VwJywgJ2NvbXBpbGVyLnR5cGVzJywgJ2NvbXBpbGVyLnByb3AtYWxpYXNlcyddXG4gIH0sXG4gIGNvbXBvbmVudDoge1xuICAgIHByb3BzOiBbJ2RlZmF1bHQtc3R5bGUnXVxuICB9XG59O1xuXG4vLyAjIyBGb3JtYXRpYyBmYWN0b3J5XG5cbi8vIENyZWF0ZSBhIG5ldyBmb3JtYXRpYyBpbnN0YW5jZS4gQSBmb3JtYXRpYyBpbnN0YW5jZSBpcyBhIGZ1bmN0aW9uIHRoYXQgY2FuXG4vLyBjcmVhdGUgZm9ybXMuIEl0IGFsc28gaGFzIGEgYC5jcmVhdGVgIG1ldGhvZCB0aGF0IGNhbiBjcmVhdGUgb3RoZXIgZm9ybWF0aWNcbi8vIGluc3RhbmNlcy5cbnZhciBjcmVhdGVGb3JtYXRpY0NvcmUgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG5cbiAgLy8gTWFrZSBhIGNvcHkgb2YgY29uZmlnIHNvIHdlIGNhbiBtb25rZXkgd2l0aCBpdC5cbiAgY29uZmlnID0gXy5leHRlbmQoe30sIGNvbmZpZyk7XG5cbiAgLy8gQWRkIGRlZmF1bHQgY29uZmlnIHNldHRpbmdzICh3aGVyZSBub3Qgb3ZlcnJpZGRlbikuXG4gIF8ua2V5cyhkZWZhdWx0UGx1Z2luQ29uZmlnKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICBjb25maWdba2V5XSA9IF8uZXh0ZW5kKHt9LCBkZWZhdWx0UGx1Z2luQ29uZmlnW2tleV0sIGNvbmZpZ1trZXldKTtcbiAgfSk7XG5cbiAgLy8gVGhlIGBmb3JtYXRpY2AgdmFyaWFibGUgd2lsbCBob2xkIHRoZSBmdW5jdGlvbiB0aGF0IGdldHMgcmV0dXJuZWQgZnJvbSB0aGVcbiAgLy8gZmFjdG9yeS5cbiAgdmFyIGZvcm1hdGljO1xuXG4gIC8vIEluc3RhbnRpYXRlZCBwbHVnaW5zIGFyZSBjYWNoZWQganVzdCBsaWtlIENvbW1vbkpTIG1vZHVsZXMuXG4gIHZhciBwbHVnaW5DYWNoZSA9IHt9O1xuXG4gIC8vICMjIFBsdWdpbiBwcm90b3R5cGVcblxuICAvLyBUaGUgUGx1Z2luIHByb3RvdHlwZSBleGlzdHMgaW5zaWRlIHRoZSBGb3JtYXRpYyBmYWN0b3J5IGZ1bmN0aW9uIGp1c3QgdG9cbiAgLy8gbWFrZSBpdCBlYXNpZXIgdG8gZ3JhYiB2YWx1ZXMgZnJvbSB0aGUgY2xvc3VyZS5cblxuICAvLyBQbHVnaW5zIGFyZSBzaW1pbGFyIHRvIENvbW1vbkpTIG1vZHVsZXMuIEZvcm1hdGljIHVzZXMgcGx1Z2lucyBhcyBhIHNsaWdodFxuICAvLyB2YXJpYW50IHRob3VnaCBiZWNhdXNlOlxuICAvLyAtIEZvcm1hdGljIHBsdWdpbnMgYXJlIGNvbmZpZ3VyYWJsZS5cbiAgLy8gLSBGb3JtYXRpYyBwbHVnaW5zIGFyZSBpbnN0YW50aWF0ZWQgcGVyIGZvcm1hdGljIGluc3RhbmNlLiBDb21tb25KUyBtb2R1bGVzXG4gIC8vICAgYXJlIGNyZWF0ZWQgb25jZSBhbmQgd291bGQgYmUgc2hhcmVkIGFjcm9zcyBhbGwgZm9ybWF0aWMgaW5zdGFuY2VzLlxuICAvLyAtIEZvcm1hdGljIHBsdWdpbnMgYXJlIGVhc2lseSBvdmVycmlkYWJsZSAoYWxzbyB2aWEgY29uZmlndXJhdGlvbikuXG5cbiAgLy8gV2hlbiBhIHBsdWdpbiBpcyBpbnN0YW50aWF0ZWQsIHdlIGNhbGwgdGhlIGBQbHVnaW5gIGNvbnN0cnVjdG9yLiBUaGUgcGx1Z2luXG4gIC8vIGluc3RhbmNlIGlzIHRoZW4gcGFzc2VkIHRvIHRoZSBwbHVnaW4ncyBpbml0aWFsaXphdGlvbiBmdW5jdGlvbi5cbiAgdmFyIFBsdWdpbiA9IGZ1bmN0aW9uIChuYW1lLCBjb25maWcpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgUGx1Z2luKSkge1xuICAgICAgcmV0dXJuIG5ldyBQbHVnaW4obmFtZSwgY29uZmlnKTtcbiAgICB9XG4gICAgLy8gRXhwb3J0cyBhbmFsb2dvdXMgdG8gQ29tbW9uSlMgZXhwb3J0cy5cbiAgICB0aGlzLmV4cG9ydHMgPSB7fTtcbiAgICAvLyBDb25maWcgdmFsdWVzIHBhc3NlZCBpbiB2aWEgZmFjdG9yeSBhcmUgcm91dGVkIHRvIHRoZSBhcHByb3ByaWF0ZVxuICAgIC8vIHBsdWdpbiBhbmQgYXZhaWxhYmxlIHZpYSBgLmNvbmZpZ2AuXG4gICAgdGhpcy5jb25maWcgPSBjb25maWcgfHwge307XG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgfTtcblxuICAvLyBHZXQgYSBjb25maWcgdmFsdWUgZm9yIGEgcGx1Z2luIG9yIHJldHVybiB0aGUgZGVmYXVsdCB2YWx1ZS5cbiAgUGx1Z2luLnByb3RvdHlwZS5jb25maWdWYWx1ZSA9IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWx1ZSkge1xuXG4gICAgaWYgKHR5cGVvZiB0aGlzLmNvbmZpZ1trZXldICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkZWZhdWx0VmFsdWUgfHwgJyc7XG4gIH07XG5cbiAgLy8gUmVxdWlyZSBhbm90aGVyIHBsdWdpbiBieSBuYW1lLiBUaGlzIGlzIG11Y2ggbGlrZSBhIENvbW1vbkpTIHJlcXVpcmVcbiAgUGx1Z2luLnByb3RvdHlwZS5yZXF1aXJlID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICByZXR1cm4gZm9ybWF0aWMucGx1Z2luKG5hbWUpO1xuICB9O1xuXG4gIC8vIEhhbmRsZSBhIHNwZWNpYWwgcGx1Z2luLCB0aGUgYGNvbXBvbmVudGAgcGx1Z2luIHdoaWNoIGZpbmRzIGNvbXBvbmVudHMuXG4gIHZhciBjb21wb25lbnRQbHVnaW47XG5cbiAgLy8gSnVzdCBoZXJlIGluIGNhc2Ugd2Ugd2FudCB0byBkeW5hbWljYWxseSBjaG9vc2UgY29tcG9uZW50IGxhdGVyLlxuICBQbHVnaW4ucHJvdG90eXBlLmNvbXBvbmVudCA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgcmV0dXJuIGNvbXBvbmVudFBsdWdpbi5jb21wb25lbnQobmFtZSk7XG4gIH07XG5cbiAgLy8gQ2hlY2sgaWYgYSBwbHVnaW4gZXhpc3RzLlxuICBQbHVnaW4ucHJvdG90eXBlLmhhc1BsdWdpbiA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgcmV0dXJuIChuYW1lIGluIHBsdWdpbkNhY2hlKSB8fCAobmFtZSBpbiBwbHVnaW5SZWdpc3RyeSk7XG4gIH07XG5cbiAgLy8gQ2hlY2sgaWYgYSBjb21wb25lbnQgZXhpc3RzLiBDb21wb25lbnRzIGFyZSByZWFsbHkganVzdCBwbHVnaW5zIHdpdGhcbiAgLy8gYSBwYXJ0aWN1bGFyIHByZWZpeCB0byB0aGVpciBuYW1lcy5cbiAgUGx1Z2luLnByb3RvdHlwZS5oYXNDb21wb25lbnQgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHJldHVybiB0aGlzLmhhc1BsdWdpbignY29tcG9uZW50LicgKyBuYW1lKTtcbiAgfTtcblxuICAvLyBHaXZlbiBhIGxpc3Qgb2YgcGx1Z2luIG5hbWVzLCByZXF1aXJlIHRoZW0gYWxsIGFuZCByZXR1cm4gYSBsaXN0IG9mXG4gIC8vIGluc3RhbnRpYXRlZCBwbHVnaW5zLlxuICBQbHVnaW4ucHJvdG90eXBlLnJlcXVpcmVBbGwgPSBmdW5jdGlvbiAocGx1Z2luTGlzdCkge1xuICAgIGlmICghcGx1Z2luTGlzdCkge1xuICAgICAgcGx1Z2luTGlzdCA9IFtdO1xuICAgIH1cbiAgICBpZiAoIV8uaXNBcnJheShwbHVnaW5MaXN0KSkge1xuICAgICAgcGx1Z2luTGlzdCA9IFtwbHVnaW5MaXN0XTtcbiAgICB9XG4gICAgLy8gSW5mbGF0ZSByZWdpc3RlcmVkIGJ1bmRsZXMuIEEgYnVuZGxlIGlzIGp1c3QgYSBuYW1lIHRoYXQgcG9pbnRzIHRvIGFuXG4gICAgLy8gYXJyYXkgb2Ygb3RoZXIgcGx1Z2luIG5hbWVzLlxuICAgIHBsdWdpbkxpc3QgPSBwbHVnaW5MaXN0Lm1hcChmdW5jdGlvbiAocGx1Z2luKSB7XG4gICAgICBpZiAoXy5pc1N0cmluZyhwbHVnaW4pKSB7XG4gICAgICAgIGlmIChfLmlzQXJyYXkocGx1Z2luUmVnaXN0cnlbcGx1Z2luXSkpIHtcbiAgICAgICAgICByZXR1cm4gcGx1Z2luUmVnaXN0cnlbcGx1Z2luXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHBsdWdpbjtcbiAgICB9KTtcbiAgICAvLyBGbGF0dGVuIGFueSBidW5kbGVzLCBzbyB3ZSBlbmQgdXAgd2l0aCBhIGZsYXQgYXJyYXkgb2YgcGx1Z2luIG5hbWVzLlxuICAgIHBsdWdpbkxpc3QgPSBfLmZsYXR0ZW4ocGx1Z2luTGlzdCk7XG4gICAgcmV0dXJuIHBsdWdpbkxpc3QubWFwKGZ1bmN0aW9uIChwbHVnaW4pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlcXVpcmUocGx1Z2luKTtcbiAgICB9LmJpbmQodGhpcykpO1xuICB9O1xuXG4gIC8vIEdpdmVuIGEgcHJlZml4LCByZXR1cm4gYSBtYXAgb2YgYWxsIGluc3RhbnRpYXRlZCBwbHVnaW5zIHdpdGggdGhhdCBwcmVmaXguXG4gIFBsdWdpbi5wcm90b3R5cGUucmVxdWlyZUFsbE9mID0gZnVuY3Rpb24gKHByZWZpeCkge1xuICAgIHZhciBtYXAgPSB7fTtcblxuICAgIGlmIChwbHVnaW5Hcm91cHNbcHJlZml4XSkge1xuICAgICAgcGx1Z2luR3JvdXBzW3ByZWZpeF0uZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICBtYXBbbmFtZV0gPSB0aGlzLnJlcXVpcmUobmFtZSk7XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgIH1cblxuICAgIHJldHVybiBtYXA7XG4gIH07XG5cbiAgLy8gIyMgRm9ybWF0aWMgZmFjdG9yeSwgY29udGludWVkLi4uXG5cbiAgLy8gR3JhYiBhIHBsdWdpbiBmcm9tIHRoZSBjYWNoZSwgb3IgbG9hZCBpdCBmcmVzaCBmcm9tIHRoZSByZWdpc3RyeS5cbiAgdmFyIGxvYWRQbHVnaW4gPSBmdW5jdGlvbiAobmFtZSwgcGx1Z2luQ29uZmlnKSB7XG4gICAgdmFyIHBsdWdpbjtcblxuICAgIC8vIFdlIGNhbiBhbHNvIGxvYWQgYW5vbnltb3VzIHBsdWdpbnMuXG4gICAgaWYgKF8uaXNGdW5jdGlvbihuYW1lKSkge1xuXG4gICAgICB2YXIgZmFjdG9yeSA9IG5hbWU7XG5cbiAgICAgIGlmIChfLmlzVW5kZWZpbmVkKGZhY3RvcnkuX19leHBvcnRzX18pKSB7XG4gICAgICAgIHBsdWdpbklkKys7XG4gICAgICAgIHBsdWdpbiA9IFBsdWdpbignYW5vbnltb3VzX3BsdWdpbl8nICsgcGx1Z2luSWQsIHBsdWdpbkNvbmZpZyB8fCB7fSk7XG4gICAgICAgIGZhY3RvcnkocGx1Z2luKTtcbiAgICAgICAgLy8gU3RvcmUgdGhlIGV4cG9ydHMgb24gdGhlIGFub255bW91cyBmdW5jdGlvbiBzbyB3ZSBrbm93IGl0J3MgYWxyZWFkeVxuICAgICAgICAvLyBiZWVuIGluc3RhbnRpYXRlZCwgYW5kIHdlIGNhbiBqdXN0IGdyYWIgdGhlIGV4cG9ydHMuXG4gICAgICAgIGZhY3RvcnkuX19leHBvcnRzX18gPSBwbHVnaW4uZXhwb3J0cztcbiAgICAgIH1cblxuICAgICAgLy8gTG9hZCB0aGUgY2FjaGVkIGV4cG9ydHMuXG4gICAgICByZXR1cm4gZmFjdG9yeS5fX2V4cG9ydHNfXztcblxuICAgIH0gZWxzZSBpZiAoXy5pc1VuZGVmaW5lZChwbHVnaW5DYWNoZVtuYW1lXSkpIHtcblxuICAgICAgaWYgKCFwbHVnaW5Db25maWcgJiYgY29uZmlnW25hbWVdKSB7XG4gICAgICAgIGlmIChjb25maWdbbmFtZV0ucGx1Z2luKSB7XG4gICAgICAgICAgcmV0dXJuIGxvYWRQbHVnaW4oY29uZmlnW25hbWVdLnBsdWdpbiwgY29uZmlnW25hbWVdIHx8IHt9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocGx1Z2luUmVnaXN0cnlbbmFtZV0pIHtcbiAgICAgICAgaWYgKF8uaXNGdW5jdGlvbihwbHVnaW5SZWdpc3RyeVtuYW1lXSkpIHtcbiAgICAgICAgICBwbHVnaW4gPSBQbHVnaW4obmFtZSwgcGx1Z2luQ29uZmlnIHx8IGNvbmZpZ1tuYW1lXSk7XG4gICAgICAgICAgcGx1Z2luUmVnaXN0cnlbbmFtZV0ocGx1Z2luKTtcbiAgICAgICAgICBwbHVnaW5DYWNoZVtuYW1lXSA9IHBsdWdpbi5leHBvcnRzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUGx1Z2luICcgKyBuYW1lICsgJyBpcyBub3QgYSBmdW5jdGlvbi4nKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQbHVnaW4gJyArIG5hbWUgKyAnIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBsdWdpbkNhY2hlW25hbWVdO1xuICB9O1xuXG4gIC8vIEFzc2lnbiBgZm9ybWF0aWNgIHRvIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBmb3JtIG9wdGlvbnMgYW5kIHJldHVybnMgYSBmb3JtLlxuICBmb3JtYXRpYyA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgcmV0dXJuIGZvcm1hdGljLmZvcm0ob3B0aW9ucyk7XG4gIH07XG5cbiAgLy8gQWxsb3cgZ2xvYmFsIHBsdWdpbiByZWdpc3RyeSBmcm9tIHRoZSBmb3JtYXRpYyBmdW5jdGlvbiBpbnN0YW5jZS5cbiAgZm9ybWF0aWMucmVnaXN0ZXIgPSBmdW5jdGlvbiAobmFtZSwgcGx1Z2luSW5pdEZuKSB7XG4gICAgcmVnaXN0ZXJQbHVnaW4obmFtZSwgcGx1Z2luSW5pdEZuKTtcbiAgICByZXR1cm4gZm9ybWF0aWM7XG4gIH07XG5cbiAgLy8gQWxsb3cgcmV0cmlldmluZyBwbHVnaW5zIGZyb20gdGhlIGZvcm1hdGljIGZ1bmN0aW9uIGluc3RhbmNlLlxuICBmb3JtYXRpYy5wbHVnaW4gPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHJldHVybiBsb2FkUGx1Z2luKG5hbWUpO1xuICB9O1xuXG4gIC8vIEFsbG93IGNyZWF0aW5nIGEgbmV3IGZvcm1hdGljIGluc3RhbmNlIGZyb20gYSBmb3JtYXRpYyBpbnN0YW5jZS5cbiAgLy9mb3JtYXRpYy5jcmVhdGUgPSBGb3JtYXRpYztcblxuICAvLyBVc2UgdGhlIGNvcmUgcGx1Z2luIHRvIGFkZCBtZXRob2RzIHRvIHRoZSBmb3JtYXRpYyBpbnN0YW5jZS5cbiAgdmFyIGNvcmUgPSBsb2FkUGx1Z2luKCdjb3JlJyk7XG5cbiAgY29yZShmb3JtYXRpYyk7XG5cbiAgLy8gTm93IGJpbmQgdGhlIGNvbXBvbmVudCBwbHVnaW4uIFdlIHdhaXQgdGlsbCBub3csIHNvIHRoZSBjb3JlIGlzIGxvYWRlZFxuICAvLyBmaXJzdC5cbiAgY29tcG9uZW50UGx1Z2luID0gbG9hZFBsdWdpbignY29tcG9uZW50Jyk7XG5cbiAgLy8gUmV0dXJuIHRoZSBmb3JtYXRpYyBmdW5jdGlvbiBpbnN0YW5jZS5cbiAgcmV0dXJuIGZvcm1hdGljO1xufTtcblxuLy8gSnVzdCBhIGhlbHBlciB0byByZWdpc3RlciBhIGJ1bmNoIG9mIHBsdWdpbnMuXG52YXIgcmVnaXN0ZXJQbHVnaW5zID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJnID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG4gIGFyZy5mb3JFYWNoKGZ1bmN0aW9uIChhcmcpIHtcbiAgICB2YXIgbmFtZSA9IGFyZ1swXTtcbiAgICB2YXIgcGx1Z2luID0gYXJnWzFdO1xuICAgIHJlZ2lzdGVyUGx1Z2luKG5hbWUsIHBsdWdpbik7XG4gIH0pO1xufTtcblxuLy8gUmVnaXN0ZXIgYWxsIHRoZSBidWlsdC1pbiBwbHVnaW5zLlxucmVnaXN0ZXJQbHVnaW5zKFxuICBbJ2NvcmUnLCByZXF1aXJlKCcuL2RlZmF1bHQvY29yZScpXSxcblxuICBbJ2NvcmUuZm9ybWF0aWMnLCByZXF1aXJlKCcuL2NvcmUvZm9ybWF0aWMnKV0sXG4gIFsnY29yZS5mb3JtLWluaXQnLCByZXF1aXJlKCcuL2NvcmUvZm9ybS1pbml0JyldLFxuICBbJ2NvcmUuZm9ybScsIHJlcXVpcmUoJy4vY29yZS9mb3JtJyldLFxuICBbJ2NvcmUuZmllbGQnLCByZXF1aXJlKCcuL2NvcmUvZmllbGQnKV0sXG5cbiAgWyd1dGlsJywgcmVxdWlyZSgnLi9kZWZhdWx0L3V0aWwnKV0sXG4gIFsnY29tcGlsZXInLCByZXF1aXJlKCcuL2RlZmF1bHQvY29tcGlsZXInKV0sXG4gIFsnZXZhbCcsIHJlcXVpcmUoJy4vZGVmYXVsdC9ldmFsJyldLFxuICBbJ2V2YWwtZnVuY3Rpb25zJywgcmVxdWlyZSgnLi9kZWZhdWx0L2V2YWwtZnVuY3Rpb25zJyldLFxuICBbJ2xvYWRlcicsIHJlcXVpcmUoJy4vZGVmYXVsdC9sb2FkZXInKV0sXG4gIFsnZmllbGQtcm91dGVyJywgcmVxdWlyZSgnLi9kZWZhdWx0L2ZpZWxkLXJvdXRlcicpXSxcbiAgWydmaWVsZC1yb3V0ZXMnLCByZXF1aXJlKCcuL2RlZmF1bHQvZmllbGQtcm91dGVzJyldLFxuXG4gIFsnY29tcGlsZXIuY2hvaWNlcycsIHJlcXVpcmUoJy4vY29tcGlsZXJzL2Nob2ljZXMnKV0sXG4gIFsnY29tcGlsZXIubG9va3VwJywgcmVxdWlyZSgnLi9jb21waWxlcnMvbG9va3VwJyldLFxuICBbJ2NvbXBpbGVyLnR5cGVzJywgcmVxdWlyZSgnLi9jb21waWxlcnMvdHlwZXMnKV0sXG4gIFsnY29tcGlsZXIucHJvcC1hbGlhc2VzJywgcmVxdWlyZSgnLi9jb21waWxlcnMvcHJvcC1hbGlhc2VzJyldLFxuXG4gIFsnc3RvcmUubWVtb3J5JywgcmVxdWlyZSgnLi9zdG9yZS9tZW1vcnknKV0sXG5cbiAgWyd0eXBlLnJvb3QnLCByZXF1aXJlKCcuL3R5cGVzL3Jvb3QnKV0sXG4gIFsndHlwZS5zdHJpbmcnLCByZXF1aXJlKCcuL3R5cGVzL3N0cmluZycpXSxcbiAgWyd0eXBlLm51bGwnLCByZXF1aXJlKCcuL3R5cGVzL251bGwnKV0sXG4gIFsndHlwZS5vYmplY3QnLCByZXF1aXJlKCcuL3R5cGVzL29iamVjdCcpXSxcbiAgWyd0eXBlLmJvb2xlYW4nLCByZXF1aXJlKCcuL3R5cGVzL2Jvb2xlYW4nKV0sXG4gIFsndHlwZS5hcnJheScsIHJlcXVpcmUoJy4vdHlwZXMvYXJyYXknKV0sXG4gIFsndHlwZS5qc29uJywgcmVxdWlyZSgnLi90eXBlcy9qc29uJyldLFxuICBbJ3R5cGUubnVtYmVyJywgcmVxdWlyZSgnLi90eXBlcy9udW1iZXInKV0sXG5cbiAgWydjb21wb25lbnQnLCByZXF1aXJlKCcuL2RlZmF1bHQvY29tcG9uZW50JyldLFxuXG4gIFsnY29tcG9uZW50LnJvb3QnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvcm9vdCcpXSxcbiAgWydjb21wb25lbnQuZmllbGQnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvZmllbGQnKV0sXG4gIFsnY29tcG9uZW50LmxhYmVsJywgcmVxdWlyZSgnLi9jb21wb25lbnRzL2xhYmVsJyldLFxuICBbJ2NvbXBvbmVudC5oZWxwJywgcmVxdWlyZSgnLi9jb21wb25lbnRzL2hlbHAnKV0sXG4gIFsnY29tcG9uZW50LnNhbXBsZScsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9zYW1wbGUnKV0sXG4gIFsnY29tcG9uZW50LmZpZWxkc2V0JywgcmVxdWlyZSgnLi9jb21wb25lbnRzL2ZpZWxkc2V0JyldLFxuICBbJ2NvbXBvbmVudC50ZXh0JywgcmVxdWlyZSgnLi9jb21wb25lbnRzL3RleHQnKV0sXG4gIFsnY29tcG9uZW50LnRleHRhcmVhJywgcmVxdWlyZSgnLi9jb21wb25lbnRzL3RleHRhcmVhJyldLFxuICBbJ2NvbXBvbmVudC5zZWxlY3QnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvc2VsZWN0JyldLFxuICBbJ2NvbXBvbmVudC5saXN0JywgcmVxdWlyZSgnLi9jb21wb25lbnRzL2xpc3QnKV0sXG4gIFsnY29tcG9uZW50Lmxpc3QtY29udHJvbCcsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9saXN0LWNvbnRyb2wnKV0sXG4gIFsnY29tcG9uZW50Lmxpc3QtaXRlbScsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9saXN0LWl0ZW0nKV0sXG4gIFsnY29tcG9uZW50Lmxpc3QtaXRlbS12YWx1ZScsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9saXN0LWl0ZW0tdmFsdWUnKV0sXG4gIFsnY29tcG9uZW50Lmxpc3QtaXRlbS1jb250cm9sJywgcmVxdWlyZSgnLi9jb21wb25lbnRzL2xpc3QtaXRlbS1jb250cm9sJyldLFxuICBbJ2NvbXBvbmVudC5pdGVtLWNob2ljZXMnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvaXRlbS1jaG9pY2VzJyldLFxuICBbJ2NvbXBvbmVudC5hZGQtaXRlbScsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9hZGQtaXRlbScpXSxcbiAgWydjb21wb25lbnQucmVtb3ZlLWl0ZW0nLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvcmVtb3ZlLWl0ZW0nKV0sXG4gIFsnY29tcG9uZW50Lm1vdmUtaXRlbS1iYWNrJywgcmVxdWlyZSgnLi9jb21wb25lbnRzL21vdmUtaXRlbS1iYWNrJyldLFxuICBbJ2NvbXBvbmVudC5tb3ZlLWl0ZW0tZm9yd2FyZCcsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9tb3ZlLWl0ZW0tZm9yd2FyZCcpXSxcbiAgWydjb21wb25lbnQuanNvbicsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9qc29uJyldLFxuICBbJ2NvbXBvbmVudC5jaGVja2JveC1saXN0JywgcmVxdWlyZSgnLi9jb21wb25lbnRzL2NoZWNrYm94LWxpc3QnKV0sXG4gIFsnY29tcG9uZW50LnByZXR0eS10ZXh0YXJlYScsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9wcmV0dHktdGV4dGFyZWEnKV0sXG4gIFsnY29tcG9uZW50LmNob2ljZXMnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvY2hvaWNlcycpXSxcbiAgWydjb21wb25lbnQub2JqZWN0JywgcmVxdWlyZSgnLi9jb21wb25lbnRzL29iamVjdCcpXSxcbiAgWydjb21wb25lbnQub2JqZWN0LWNvbnRyb2wnLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvb2JqZWN0LWNvbnRyb2wnKV0sXG4gIFsnY29tcG9uZW50Lm9iamVjdC1pdGVtJywgcmVxdWlyZSgnLi9jb21wb25lbnRzL29iamVjdC1pdGVtJyldLFxuICBbJ2NvbXBvbmVudC5vYmplY3QtaXRlbS1rZXknLCByZXF1aXJlKCcuL2NvbXBvbmVudHMvb2JqZWN0LWl0ZW0ta2V5JyldLFxuICBbJ2NvbXBvbmVudC5vYmplY3QtaXRlbS12YWx1ZScsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9vYmplY3QtaXRlbS12YWx1ZScpXSxcbiAgWydjb21wb25lbnQub2JqZWN0LWl0ZW0tY29udHJvbCcsIHJlcXVpcmUoJy4vY29tcG9uZW50cy9vYmplY3QtaXRlbS1jb250cm9sJyldLFxuXG4gIFsnbWl4aW4uY2xpY2stb3V0c2lkZScsIHJlcXVpcmUoJy4vbWl4aW5zL2NsaWNrLW91dHNpZGUnKV0sXG4gIFsnbWl4aW4uZmllbGQnLCByZXF1aXJlKCcuL21peGlucy9maWVsZCcpXSxcbiAgWydtaXhpbi5pbnB1dC1hY3Rpb25zJywgcmVxdWlyZSgnLi9taXhpbnMvaW5wdXQtYWN0aW9ucycpXSxcbiAgWydtaXhpbi5yZXNpemUnLCByZXF1aXJlKCcuL21peGlucy9yZXNpemUnKV0sXG4gIFsnbWl4aW4uc2Nyb2xsJywgcmVxdWlyZSgnLi9taXhpbnMvc2Nyb2xsJyldLFxuICBbJ21peGluLnVuZG8tc3RhY2snLCByZXF1aXJlKCcuL21peGlucy91bmRvLXN0YWNrJyldLFxuXG4gIFsnYm9vdHN0cmFwLXN0eWxlJywgcmVxdWlyZSgnLi9wbHVnaW5zL2Jvb3RzdHJhcC1zdHlsZScpXSxcbiAgWydkZWZhdWx0LXN0eWxlJywgcmVxdWlyZSgnLi9wbHVnaW5zL2RlZmF1bHQtc3R5bGUnKV1cbik7XG5cbi8vIENyZWF0ZSB0aGUgZGVmYXVsdCBmb3JtYXRpYyBpbnN0YW5jZS5cbi8vdmFyIGRlZmF1bHRDb3JlID0gRm9ybWF0aWMoKTtcblxuLy8gRXhwb3J0IGl0IVxuLy9tb2R1bGUuZXhwb3J0cyA9IGRlZmF1bHRGb3JtYXRpYztcblxudmFyIGNyZWF0ZUZvcm1hdGljQ29tcG9uZW50Q2xhc3MgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG5cbiAgdmFyIGNvcmUgPSBjcmVhdGVGb3JtYXRpY0NvcmUoY29uZmlnKTtcblxuICByZXR1cm4gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgZGlzcGxheU5hbWU6ICdGb3JtYXRpYycsXG5cbiAgICBzdGF0aWNzOiB7XG4gICAgICBjb25maWc6IGNyZWF0ZUZvcm1hdGljQ29tcG9uZW50Q2xhc3MsXG4gICAgICBmb3JtOiBjb3JlLFxuICAgICAgcGx1Z2luOiBjb3JlLnBsdWdpbixcbiAgICAgIHJlZ2lzdGVyUGx1Z2luOiByZWdpc3RlclBsdWdpblxuICAgIH0sXG5cbiAgICBnZXRJbml0aWFsU3RhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmb3JtID0gdGhpcy5wcm9wcy5mb3JtIHx8IHRoaXMucHJvcHMuZGVmYXVsdEZvcm07XG4gICAgICByZXR1cm4ge1xuICAgICAgICBmb3JtOiBmb3JtLFxuICAgICAgICBmaWVsZDogZm9ybS5maWVsZCgpLFxuICAgICAgICBjb250cm9sbGVkOiB0aGlzLnByb3BzLmZvcm0gPyB0cnVlIDogZmFsc2VcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGNvbXBvbmVudERpZE1vdW50OiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBmb3JtID0gdGhpcy5zdGF0ZS5mb3JtO1xuICAgICAgaWYgKCFmb3JtKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTXVzdCBzdXBwbHkgYSBmb3JtIG9yIGRlZmF1bHRGb3JtLicpO1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMuc3RhdGUuY29udHJvbGxlZCkge1xuICAgICAgICBmb3JtLm9uY2UoJ2NoYW5nZScsIHRoaXMub25Gb3JtQ2hhbmdlZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3JtLm9uKCdjaGFuZ2UnLCB0aGlzLm9uRm9ybUNoYW5nZWQpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBvbkZvcm1DaGFuZ2VkOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgIGlmIChldmVudC5jaGFuZ2luZy5hY3Rpb24gPT09ICdzZXRNZXRhJyB8fCBldmVudC5jaGFuZ2luZy5hY3Rpb24gPT09ICdzZXRGaWVsZHMnIHx8IGV2ZW50LmNoYW5naW5nLmFjdGlvbiA9PT0gJ3Jlc2V0Jykge1xuICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICBmaWVsZDogdGhpcy5zdGF0ZS5mb3JtLmZpZWxkKClcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIE1ldGEgZXZlbnRzIGFuZCByZXNldCBldmVudCBkb24ndCBtYWtlIGl0IG91dCBmb3Igbm93LlxuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnByb3BzLm9uQ2hhbmdlKSB7XG4gICAgICAgIHRoaXMucHJvcHMub25DaGFuZ2UodGhpcy5zdGF0ZS5mb3JtLnZhbCgpLCBldmVudC5jaGFuZ2luZyk7XG4gICAgICB9XG4gICAgICBpZiAoIXRoaXMuc3RhdGUuY29udHJvbGxlZCkge1xuICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICBmaWVsZDogdGhpcy5zdGF0ZS5mb3JtLmZpZWxkKClcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGNvbXBvbmVudFdpbGxVbm1vdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgZm9ybSA9IHRoaXMuc3RhdGUuZm9ybTtcbiAgICAgIGlmIChmb3JtKSB7XG4gICAgICAgIGZvcm0ub2ZmKCdjaGFuZ2UnLCB0aGlzLm9uRm9ybUNoYW5nZWQpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBjb21wb25lbnRXaWxsUmVjZWl2ZVByb3BzOiBmdW5jdGlvbiAobmV4dFByb3BzKSB7XG4gICAgICBpZiAodGhpcy5zdGF0ZS5jb250cm9sbGVkKSB7XG4gICAgICAgIGlmICghbmV4dFByb3BzLmZvcm0pIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ011c3Qgc3VwcGx5IGEgbmV3IGZvcm0gZm9yIGEgY29udHJvbGxlZCBjb21wb25lbnQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgbmV4dFByb3BzLmZvcm0ub25jZSgnY2hhbmdlJywgdGhpcy5vbkZvcm1DaGFuZ2VkKTtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgZm9ybTogbmV4dFByb3BzLmZvcm0sXG4gICAgICAgICAgZmllbGQ6IG5leHRQcm9wcy5mb3JtLmZpZWxkKClcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFIuZGl2KHtjbGFzc05hbWU6ICdmb3JtYXRpYyd9LFxuICAgICAgICB0aGlzLnN0YXRlLmZpZWxkLmNvbXBvbmVudCh7b25Gb2N1czogdGhpcy5wcm9wcy5vbkZvY3VzLCBvbkJsdXI6IHRoaXMucHJvcHMub25CbHVyfSlcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlRm9ybWF0aWNDb21wb25lbnRDbGFzcygpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIG1peGluLmNsaWNrLW91dHNpZGVcblxuLypcblRoZXJlJ3Mgbm8gbmF0aXZlIFJlYWN0IHdheSB0byBkZXRlY3QgY2xpY2tpbmcgb3V0c2lkZSBhbiBlbGVtZW50LiBTb21ldGltZXNcbnRoaXMgaXMgdXNlZnVsLCBzbyB0aGF0J3Mgd2hhdCB0aGlzIG1peGluIGRvZXMuIFRvIHVzZSBpdCwgbWl4IGl0IGluIGFuZCB1c2UgaXRcbmZyb20geW91ciBjb21wb25lbnQgbGlrZSB0aGlzOlxuXG5gYGBqc1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG4gIHBsdWdpbi5leHBvcnRzID0gUmVhY3QuY3JlYXRlQ2xhc3Moe1xuXG4gICAgbWl4aW5zOiBbcGx1Z2luLnJlcXVpcmUoJ21peGluLmNsaWNrLW91dHNpZGUnKV0sXG5cbiAgICBvbkNsaWNrT3V0c2lkZTogZnVuY3Rpb24gKCkge1xuICAgICAgY29uc29sZS5sb2coJ2NsaWNrZWQgb3V0c2lkZSEnKTtcbiAgICB9LFxuXG4gICAgY29tcG9uZW50RGlkTW91bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuc2V0T25DbGlja091dHNpZGUoJ215RGl2JywgdGhpcy5vbkNsaWNrT3V0c2lkZSk7XG4gICAgfSxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFJlYWN0LkRPTS5kaXYoe3JlZjogJ215RGl2J30sXG4gICAgICAgICdIZWxsbyEnXG4gICAgICApXG4gICAgfVxuICB9KTtcbn07XG5gYGBcbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbnZhciBoYXNBbmNlc3RvciA9IGZ1bmN0aW9uIChjaGlsZCwgcGFyZW50KSB7XG4gIGlmIChjaGlsZC5wYXJlbnROb2RlID09PSBwYXJlbnQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoY2hpbGQucGFyZW50Tm9kZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gaGFzQW5jZXN0b3IoY2hpbGQucGFyZW50Tm9kZSwgcGFyZW50KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0ge1xuXG4gICAgLy8gX29uQ2xpY2tEb2N1bWVudDogZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAvLyAgIGNvbnNvbGUubG9nKCdjbGljayBkb2MnKVxuICAgIC8vICAgaWYgKHRoaXMuX2RpZE1vdXNlRG93bikge1xuICAgIC8vICAgICBfLmVhY2godGhpcy5jbGlja091dHNpZGVIYW5kbGVycywgZnVuY3Rpb24gKGZ1bmNzLCByZWYpIHtcbiAgICAvLyAgICAgICBpZiAoaXNPdXRzaWRlKGV2ZW50LnRhcmdldCwgdGhpcy5yZWZzW3JlZl0uZ2V0RE9NTm9kZSgpKSkge1xuICAgIC8vICAgICAgICAgZnVuY3MuZm9yRWFjaChmdW5jdGlvbiAoZm4pIHtcbiAgICAvLyAgICAgICAgICAgZm4uY2FsbCh0aGlzKTtcbiAgICAvLyAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgLy8gICAgICAgfVxuICAgIC8vICAgICB9LmJpbmQodGhpcykpO1xuICAgIC8vICAgfVxuICAgIC8vIH0sXG5cbiAgICBpc05vZGVPdXRzaWRlOiBmdW5jdGlvbiAobm9kZU91dCwgbm9kZUluKSB7XG4gICAgICBpZiAobm9kZU91dCA9PT0gbm9kZUluKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmIChoYXNBbmNlc3Rvcihub2RlT3V0LCBub2RlSW4pKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG5cbiAgICBpc05vZGVJbnNpZGU6IGZ1bmN0aW9uIChub2RlSW4sIG5vZGVPdXQpIHtcbiAgICAgIHJldHVybiAhdGhpcy5pc05vZGVPdXRzaWRlKG5vZGVJbiwgbm9kZU91dCk7XG4gICAgfSxcblxuICAgIF9vbkNsaWNrTW91c2Vkb3duOiBmdW5jdGlvbigpIHtcbiAgICAgIC8vdGhpcy5fZGlkTW91c2VEb3duID0gdHJ1ZTtcbiAgICAgIF8uZWFjaCh0aGlzLmNsaWNrT3V0c2lkZUhhbmRsZXJzLCBmdW5jdGlvbiAoZnVuY3MsIHJlZikge1xuICAgICAgICBpZiAodGhpcy5yZWZzW3JlZl0pIHtcbiAgICAgICAgICB0aGlzLl9tb3VzZWRvd25SZWZzW3JlZl0gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgIH0sXG5cbiAgICBfb25DbGlja01vdXNldXA6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgXy5lYWNoKHRoaXMuY2xpY2tPdXRzaWRlSGFuZGxlcnMsIGZ1bmN0aW9uIChmdW5jcywgcmVmKSB7XG4gICAgICAgIGlmICh0aGlzLnJlZnNbcmVmXSAmJiB0aGlzLl9tb3VzZWRvd25SZWZzW3JlZl0pIHtcbiAgICAgICAgICBpZiAodGhpcy5pc05vZGVPdXRzaWRlKGV2ZW50LnRhcmdldCwgdGhpcy5yZWZzW3JlZl0uZ2V0RE9NTm9kZSgpKSkge1xuICAgICAgICAgICAgZnVuY3MuZm9yRWFjaChmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgICAgZm4uY2FsbCh0aGlzLCBldmVudCk7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9tb3VzZWRvd25SZWZzW3JlZl0gPSBmYWxzZTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfSxcblxuICAgIC8vIF9vbkNsaWNrRG9jdW1lbnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyAgIGNvbnNvbGUubG9nKCdjbGlja2V0eScpXG4gICAgLy8gICBfLmVhY2godGhpcy5jbGlja091dHNpZGVIYW5kbGVycywgZnVuY3Rpb24gKGZ1bmNzLCByZWYpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coJ2NsaWNrZXR5JywgcmVmLCB0aGlzLnJlZnNbcmVmXSlcbiAgICAvLyAgIH0uYmluZCh0aGlzKSk7XG4gICAgLy8gfSxcblxuICAgIHNldE9uQ2xpY2tPdXRzaWRlOiBmdW5jdGlvbiAocmVmLCBmbikge1xuICAgICAgaWYgKCF0aGlzLmNsaWNrT3V0c2lkZUhhbmRsZXJzW3JlZl0pIHtcbiAgICAgICAgdGhpcy5jbGlja091dHNpZGVIYW5kbGVyc1tyZWZdID0gW107XG4gICAgICB9XG4gICAgICB0aGlzLmNsaWNrT3V0c2lkZUhhbmRsZXJzW3JlZl0ucHVzaChmbik7XG4gICAgfSxcblxuICAgIGNvbXBvbmVudERpZE1vdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmNsaWNrT3V0c2lkZUhhbmRsZXJzID0ge307XG4gICAgICB0aGlzLl9kaWRNb3VzZURvd24gPSBmYWxzZTtcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMuX29uQ2xpY2tNb3VzZWRvd24pO1xuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMuX29uQ2xpY2tNb3VzZXVwKTtcbiAgICAgIC8vZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLl9vbkNsaWNrRG9jdW1lbnQpO1xuICAgICAgdGhpcy5fbW91c2Vkb3duUmVmcyA9IHt9O1xuICAgIH0sXG5cbiAgICBjb21wb25lbnRXaWxsVW5tb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5jbGlja091dHNpZGVIYW5kbGVycyA9IHt9O1xuICAgICAgLy9kb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuX29uQ2xpY2tEb2N1bWVudCk7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5fb25DbGlja01vdXNldXApO1xuICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5fb25DbGlja01vdXNlZG93bik7XG4gICAgfVxuICB9O1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBtaXhpbi5maWVsZFxuXG4vKlxuV3JhcCB1cCB5b3VyIGZpZWxkcyB3aXRoIHRoaXMgbWl4aW4gdG8gZ2V0OlxuLSBBdXRvbWF0aWMgbWV0YWRhdGEgbG9hZGluZy5cbi0gQW55dGhpbmcgZWxzZSBkZWNpZGVkIGxhdGVyLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgdmFyIG5vcm1hbGl6ZU1ldGEgPSBmdW5jdGlvbiAobWV0YSkge1xuICAgIHZhciBuZWVkc1NvdXJjZSA9IFtdO1xuXG4gICAgbWV0YS5mb3JFYWNoKGZ1bmN0aW9uIChhcmdzKSB7XG5cblxuICAgICAgaWYgKF8uaXNBcnJheShhcmdzKSAmJiBhcmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgaWYgKF8uaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICAgIGFyZ3MuZm9yRWFjaChmdW5jdGlvbiAoYXJncykge1xuICAgICAgICAgICAgbmVlZHNTb3VyY2UucHVzaChhcmdzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBuZWVkc1NvdXJjZS5wdXNoKGFyZ3MpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAobmVlZHNTb3VyY2UubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyBNdXN0IGp1c3QgYmUgYSBzaW5nbGUgbmVlZCwgYW5kIG5vdCBhbiBhcnJheS5cbiAgICAgIG5lZWRzU291cmNlID0gW21ldGFdO1xuICAgIH1cblxuICAgIHJldHVybiBuZWVkc1NvdXJjZTtcbiAgfTtcblxuICBwbHVnaW4uZXhwb3J0cyA9IHtcblxuICAgIGxvYWROZWVkZWRNZXRhOiBmdW5jdGlvbiAocHJvcHMpIHtcbiAgICAgIGlmIChwcm9wcy5maWVsZCAmJiBwcm9wcy5maWVsZC5mb3JtKSB7XG4gICAgICAgIGlmIChwcm9wcy5maWVsZC5kZWYubmVlZHNTb3VyY2UgJiYgcHJvcHMuZmllbGQuZGVmLm5lZWRzU291cmNlLmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgIHZhciBuZWVkc1NvdXJjZSA9IG5vcm1hbGl6ZU1ldGEocHJvcHMuZmllbGQuZGVmLm5lZWRzU291cmNlKTtcblxuICAgICAgICAgIG5lZWRzU291cmNlLmZvckVhY2goZnVuY3Rpb24gKG5lZWRzKSB7XG4gICAgICAgICAgICBpZiAobmVlZHMpIHtcbiAgICAgICAgICAgICAgcHJvcHMuZmllbGQuZm9ybS5sb2FkTWV0YS5hcHBseShwcm9wcy5maWVsZC5mb3JtLCBuZWVkcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gY3VycmVudGx5IHVudXNlZDsgd2lsbCB1c2UgdG8gdW5sb2FkIG1ldGFkYXRhIG9uIGNoYW5nZVxuICAgIHVubG9hZE90aGVyTWV0YTogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHByb3BzID0gdGhpcy5wcm9wcztcbiAgICAgIGlmIChwcm9wcy5maWVsZC5kZWYucmVmcmVzaE1ldGEpIHtcbiAgICAgICAgdmFyIHJlZnJlc2hNZXRhID0gbm9ybWFsaXplTWV0YShwcm9wcy5maWVsZC5kZWYucmVmcmVzaE1ldGEpO1xuICAgICAgICBwcm9wcy5maWVsZC5mb3JtLnVubG9hZE90aGVyTWV0YShyZWZyZXNoTWV0YSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGNvbXBvbmVudERpZE1vdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmxvYWROZWVkZWRNZXRhKHRoaXMucHJvcHMpO1xuICAgIH0sXG5cbiAgICBjb21wb25lbnRXaWxsUmVjZWl2ZVByb3BzOiBmdW5jdGlvbiAobmV4dFByb3BzKSB7XG4gICAgICB0aGlzLmxvYWROZWVkZWRNZXRhKG5leHRQcm9wcyk7XG4gICAgfSxcblxuICAgIGNvbXBvbmVudFdpbGxVbm1vdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBSZW1vdmluZyB0aGlzIGFzIGl0J3MgYSBiYWQgaWRlYSwgYmVjYXVzZSB1bm1vdW50aW5nIGEgY29tcG9uZW50IGlzIG5vdFxuICAgICAgLy8gYWx3YXlzIGEgc2lnbmFsIHRvIHJlbW92ZSB0aGUgZmllbGQuIFdpbGwgaGF2ZSB0byBmaW5kIGEgYmV0dGVyIHdheS5cblxuICAgICAgLy8gaWYgKHRoaXMucHJvcHMuZmllbGQpIHtcbiAgICAgIC8vICAgdGhpcy5wcm9wcy5maWVsZC5lcmFzZSgpO1xuICAgICAgLy8gfVxuICAgIH0sXG5cbiAgICBvbkZvY3VzOiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAodGhpcy5wcm9wcy5vbkZvY3VzKSB7XG4gICAgICAgIHRoaXMucHJvcHMub25Gb2N1cyh7cGF0aDogdGhpcy5wcm9wcy5maWVsZC52YWx1ZVBhdGgoKSwgZmllbGQ6IHRoaXMucHJvcHMuZmllbGQuZGVmfSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIG9uQmx1cjogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHRoaXMucHJvcHMub25CbHVyKSB7XG4gICAgICAgIHRoaXMucHJvcHMub25CbHVyKHtwYXRoOiB0aGlzLnByb3BzLmZpZWxkLnZhbHVlUGF0aCgpLCBmaWVsZDogdGhpcy5wcm9wcy5maWVsZC5kZWZ9KTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvLyAjIG1peGluLmlucHV0LWFjdGlvbnNcblxuLypcbkN1cnJlbnRseSB1bnVzZWQuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0ge1xuXG4gICAgb25Gb2N1czogZnVuY3Rpb24gKCkge1xuXG4gICAgfSxcblxuICAgIG9uQmx1cjogZnVuY3Rpb24gKCkge1xuXG4gICAgfSxcblxuICAgIG9uQ2hhbmdlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB9XG4gIH07XG59O1xuIiwiLy8gIyBtaXhpbi5yZXNpemVcblxuLypcbllvdSdkIHRoaW5rIGl0IHdvdWxkIGJlIHByZXR0eSBlYXN5IHRvIGRldGVjdCB3aGVuIGEgRE9NIGVsZW1lbnQgaXMgcmVzaXplZC5cbkFuZCB5b3UnZCBiZSB3cm9uZy4gVGhlcmUgYXJlIHZhcmlvdXMgdHJpY2tzLCBidXQgbm9uZSBvZiB0aGVtIHdvcmsgdmVyeSB3ZWxsLlxuU28sIHVzaW5nIGdvb2Qgb2wnIHBvbGxpbmcgaGVyZS4gVG8gdHJ5IHRvIGJlIGFzIGVmZmljaWVudCBhcyBwb3NzaWJsZSwgdGhlcmVcbmlzIG9ubHkgYSBzaW5nbGUgc2V0SW50ZXJ2YWwgdXNlZCBmb3IgYWxsIGVsZW1lbnRzLiBUbyB1c2U6XG5cbmBgYGpzXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcbiAgcGx1Z2luLmV4cG9ydHMgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cbiAgICBtaXhpbnM6IFtwbHVnaW4ucmVxdWlyZSgnbWl4aW4ucmVzaXplJyldLFxuXG4gICAgb25SZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdyZXNpemVkIScpO1xuICAgIH0sXG5cbiAgICBjb21wb25lbnREaWRNb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5zZXRPblJlc2l6ZSgnbXlUZXh0JywgdGhpcy5vblJlc2l6ZSk7XG4gICAgfSxcblxuICAgIG9uQ2hhbmdlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAuLi5cbiAgICB9LFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gUmVhY3QuRE9NLnRleHRhcmVhKHtyZWY6ICdteVRleHQnLCB2YWx1ZTogdGhpcy5wcm9wcy52YWx1ZSwgb25DaGFuZ2U6IC4uLn0pXG4gICAgfVxuICB9KTtcbn07XG5gYGBcbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIGlkID0gMDtcblxudmFyIHJlc2l6ZUludGVydmFsRWxlbWVudHMgPSB7fTtcbnZhciByZXNpemVJbnRlcnZhbEVsZW1lbnRzQ291bnQgPSAwO1xudmFyIHJlc2l6ZUludGVydmFsVGltZXIgPSBudWxsO1xuXG52YXIgY2hlY2tFbGVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgT2JqZWN0LmtleXMocmVzaXplSW50ZXJ2YWxFbGVtZW50cykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIGVsZW1lbnQgPSByZXNpemVJbnRlcnZhbEVsZW1lbnRzW2tleV07XG4gICAgaWYgKGVsZW1lbnQuY2xpZW50V2lkdGggIT09IGVsZW1lbnQuX19wcmV2Q2xpZW50V2lkdGggfHwgZWxlbWVudC5jbGllbnRIZWlnaHQgIT09IGVsZW1lbnQuX19wcmV2Q2xpZW50SGVpZ2h0KSB7XG4gICAgICBlbGVtZW50Ll9fcHJldkNsaWVudFdpZHRoID0gZWxlbWVudC5jbGllbnRXaWR0aDtcbiAgICAgIGVsZW1lbnQuX19wcmV2Q2xpZW50SGVpZ2h0ID0gZWxlbWVudC5jbGllbnRIZWlnaHQ7XG4gICAgICB2YXIgaGFuZGxlcnMgPSBlbGVtZW50Ll9fcmVzaXplSGFuZGxlcnM7XG4gICAgICBoYW5kbGVycy5mb3JFYWNoKGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gICAgICAgIGhhbmRsZXIoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSwgMTAwKTtcbn07XG5cbnZhciBhZGRSZXNpemVJbnRlcnZhbEhhbmRsZXIgPSBmdW5jdGlvbiAoZWxlbWVudCwgZm4pIHtcbiAgaWYgKHJlc2l6ZUludGVydmFsVGltZXIgPT09IG51bGwpIHtcbiAgICByZXNpemVJbnRlcnZhbFRpbWVyID0gc2V0SW50ZXJ2YWwoY2hlY2tFbGVtZW50cywgMTAwKTtcbiAgfVxuICBpZiAoISgnX19yZXNpemVJZCcgaW4gZWxlbWVudCkpIHtcbiAgICBpZCsrO1xuICAgIGVsZW1lbnQuX19wcmV2Q2xpZW50V2lkdGggPSBlbGVtZW50LmNsaWVudFdpZHRoO1xuICAgIGVsZW1lbnQuX19wcmV2Q2xpZW50SGVpZ2h0ID0gZWxlbWVudC5jbGllbnRIZWlnaHQ7XG4gICAgZWxlbWVudC5fX3Jlc2l6ZUlkID0gaWQ7XG4gICAgcmVzaXplSW50ZXJ2YWxFbGVtZW50c0NvdW50Kys7XG4gICAgcmVzaXplSW50ZXJ2YWxFbGVtZW50c1tpZF0gPSBlbGVtZW50O1xuICAgIGVsZW1lbnQuX19yZXNpemVIYW5kbGVycyA9IFtdO1xuICB9XG4gIGVsZW1lbnQuX19yZXNpemVIYW5kbGVycy5wdXNoKGZuKTtcbn07XG5cbnZhciByZW1vdmVSZXNpemVJbnRlcnZhbEhhbmRsZXJzID0gZnVuY3Rpb24gKGVsZW1lbnQpIHtcbiAgaWYgKCEoJ19fcmVzaXplSWQnIGluIGVsZW1lbnQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBpZCA9IGVsZW1lbnQuX19yZXNpemVJZDtcbiAgZGVsZXRlIGVsZW1lbnQuX19yZXNpemVJZDtcbiAgZGVsZXRlIGVsZW1lbnQuX19yZXNpemVIYW5kbGVycztcbiAgZGVsZXRlIHJlc2l6ZUludGVydmFsRWxlbWVudHNbaWRdO1xuICByZXNpemVJbnRlcnZhbEVsZW1lbnRzQ291bnQtLTtcbiAgaWYgKHJlc2l6ZUludGVydmFsRWxlbWVudHNDb3VudCA8IDEpIHtcbiAgICBjbGVhckludGVydmFsKHJlc2l6ZUludGVydmFsVGltZXIpO1xuICAgIHJlc2l6ZUludGVydmFsVGltZXIgPSBudWxsO1xuICB9XG59O1xuXG52YXIgb25SZXNpemUgPSBmdW5jdGlvbiAocmVmLCBmbikge1xuICBmbihyZWYpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSB7XG5cbiAgICBjb21wb25lbnREaWRNb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHRoaXMub25SZXNpemVXaW5kb3cpIHtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25SZXNpemVXaW5kb3cpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXNpemVFbGVtZW50UmVmcyA9IHt9O1xuICAgIH0sXG5cbiAgICBjb21wb25lbnRXaWxsVW5tb3VudDogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHRoaXMub25SZXNpemVXaW5kb3cpIHtcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25SZXNpemVXaW5kb3cpO1xuICAgICAgfVxuICAgICAgT2JqZWN0LmtleXModGhpcy5yZXNpemVFbGVtZW50UmVmcykuZm9yRWFjaChmdW5jdGlvbiAocmVmKSB7XG4gICAgICAgIHJlbW92ZVJlc2l6ZUludGVydmFsSGFuZGxlcnModGhpcy5yZWZzW3JlZl0uZ2V0RE9NTm9kZSgpKTtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfSxcblxuICAgIHNldE9uUmVzaXplOiBmdW5jdGlvbiAocmVmLCBmbikge1xuICAgICAgaWYgKCF0aGlzLnJlc2l6ZUVsZW1lbnRSZWZzW3JlZl0pIHtcbiAgICAgICAgdGhpcy5yZXNpemVFbGVtZW50UmVmc1tyZWZdID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGFkZFJlc2l6ZUludGVydmFsSGFuZGxlcih0aGlzLnJlZnNbcmVmXS5nZXRET01Ob2RlKCksIG9uUmVzaXplLmJpbmQodGhpcywgcmVmLCBmbikpO1xuICAgIH1cbiAgfTtcbn07XG4iLCIvLyAjIG1peGluLnNjcm9sbFxuXG4ndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHBsdWdpbi5leHBvcnRzID0ge1xuXG4gICAgY29tcG9uZW50RGlkTW91bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICh0aGlzLm9uU2Nyb2xsV2luZG93KSB7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzY3JvbGwnLCB0aGlzLm9uU2Nyb2xsV2luZG93KTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgY29tcG9uZW50V2lsbFVubW91bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICh0aGlzLm9uU2Nyb2xsV2luZG93KSB7XG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdzY3JvbGwnLCB0aGlzLm9uU2Nyb2xsV2luZG93KTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG59O1xuIiwiLy8gIyBtaXhpbi51bmRvLXN0YWNrXG5cbi8qXG5HaXZlcyB5b3VyIGNvbXBvbmVudCBhbiB1bmRvIHN0YWNrLlxuKi9cblxuLy8gaHR0cDovL3Byb21ldGhldXNyZXNlYXJjaC5naXRodWIuaW8vcmVhY3QtZm9ybXMvZXhhbXBsZXMvdW5kby5odG1sXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFVuZG9TdGFjayA9IHtcbiAgZ2V0SW5pdGlhbFN0YXRlOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge3VuZG86IFtdLCByZWRvOiBbXX07XG4gIH0sXG5cbiAgc25hcHNob3Q6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB1bmRvID0gdGhpcy5zdGF0ZS51bmRvLmNvbmNhdCh0aGlzLmdldFN0YXRlU25hcHNob3QoKSk7XG4gICAgaWYgKHR5cGVvZiB0aGlzLnN0YXRlLnVuZG9EZXB0aCA9PT0gJ251bWJlcicpIHtcbiAgICAgIGlmICh1bmRvLmxlbmd0aCA+IHRoaXMuc3RhdGUudW5kb0RlcHRoKSB7XG4gICAgICAgIHVuZG8uc2hpZnQoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5zZXRTdGF0ZSh7dW5kbzogdW5kbywgcmVkbzogW119KTtcbiAgfSxcblxuICBoYXNVbmRvOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZS51bmRvLmxlbmd0aCA+IDA7XG4gIH0sXG5cbiAgaGFzUmVkbzogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGUucmVkby5sZW5ndGggPiAwO1xuICB9LFxuXG4gIHJlZG86IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3VuZG9JbXBsKHRydWUpO1xuICB9LFxuXG4gIHVuZG86IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3VuZG9JbXBsKCk7XG4gIH0sXG5cbiAgX3VuZG9JbXBsOiBmdW5jdGlvbihpc1JlZG8pIHtcbiAgICB2YXIgdW5kbyA9IHRoaXMuc3RhdGUudW5kby5zbGljZSgwKTtcbiAgICB2YXIgcmVkbyA9IHRoaXMuc3RhdGUucmVkby5zbGljZSgwKTtcbiAgICB2YXIgc25hcHNob3Q7XG5cbiAgICBpZiAoaXNSZWRvKSB7XG4gICAgICBpZiAocmVkby5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc25hcHNob3QgPSByZWRvLnBvcCgpO1xuICAgICAgdW5kby5wdXNoKHRoaXMuZ2V0U3RhdGVTbmFwc2hvdCgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHVuZG8ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNuYXBzaG90ID0gdW5kby5wb3AoKTtcbiAgICAgIHJlZG8ucHVzaCh0aGlzLmdldFN0YXRlU25hcHNob3QoKSk7XG4gICAgfVxuXG4gICAgdGhpcy5zZXRTdGF0ZVNuYXBzaG90KHNuYXBzaG90KTtcbiAgICB0aGlzLnNldFN0YXRlKHt1bmRvOnVuZG8sIHJlZG86cmVkb30pO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcbiAgcGx1Z2luLmV4cG9ydHMgPSBVbmRvU3RhY2s7XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBib290c3RyYXBcblxuLypcblRoZSBib290c3RyYXAgcGx1Z2luIGJ1bmRsZSBleHBvcnRzIGEgYnVuY2ggb2YgXCJwcm9wIG1vZGlmaWVyXCIgcGx1Z2lucyB3aGljaFxubWFuaXB1bGF0ZSB0aGUgcHJvcHMgZ29pbmcgaW50byBtYW55IG9mIHRoZSBjb21wb25lbnRzLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcblxudmFyIG1vZGlmaWVycyA9IHtcblxuICAnZmllbGQnOiB7Y2xhc3NOYW1lOiAnZm9ybS1ncm91cCd9LFxuICAnaGVscCc6IHtjbGFzc05hbWU6ICdoZWxwLWJsb2NrJ30sXG4gICdzYW1wbGUnOiB7Y2xhc3NOYW1lOiAnaGVscC1ibG9jayd9LFxuICAndGV4dCc6IHtjbGFzc05hbWU6ICdmb3JtLWNvbnRyb2wnfSxcbiAgJ3RleHRhcmVhJzoge2NsYXNzTmFtZTogJ2Zvcm0tY29udHJvbCd9LFxuICAncHJldHR5LXRleHRhcmVhJzoge2NsYXNzTmFtZTogJ2Zvcm0tY29udHJvbCd9LFxuICAnanNvbic6IHtjbGFzc05hbWU6ICdmb3JtLWNvbnRyb2wnfSxcbiAgJ3NlbGVjdCc6IHtjbGFzc05hbWU6ICdmb3JtLWNvbnRyb2wnfSxcbiAgLy8nbGlzdCc6IHtjbGFzc05hbWU6ICd3ZWxsJ30sXG4gICdsaXN0LWNvbnRyb2wnOiB7Y2xhc3NOYW1lOiAnZm9ybS1pbmxpbmUnfSxcbiAgJ2xpc3QtaXRlbSc6IHtjbGFzc05hbWU6ICd3ZWxsJ30sXG4gICdpdGVtLWNob2ljZXMnOiB7Y2xhc3NOYW1lOiAnZm9ybS1jb250cm9sJ30sXG4gICdhZGQtaXRlbSc6IHtjbGFzc05hbWU6ICdnbHlwaGljb24gZ2x5cGhpY29uLXBsdXMnLCBsYWJlbDogJyd9LFxuICAncmVtb3ZlLWl0ZW0nOiB7Y2xhc3NOYW1lOiAnZ2x5cGhpY29uIGdseXBoaWNvbi1yZW1vdmUnLCBsYWJlbDogJyd9LFxuICAnbW92ZS1pdGVtLWJhY2snOiB7Y2xhc3NOYW1lOiAnZ2x5cGhpY29uIGdseXBoaWNvbi1hcnJvdy11cCcsIGxhYmVsOiAnJ30sXG4gICdtb3ZlLWl0ZW0tZm9yd2FyZCc6IHtjbGFzc05hbWU6ICdnbHlwaGljb24gZ2x5cGhpY29uLWFycm93LWRvd24nLCBsYWJlbDogJyd9LFxuICAnb2JqZWN0LWl0ZW0ta2V5Jzoge2NsYXNzTmFtZTogJ2Zvcm0tY29udHJvbCd9XG59O1xuXG4vLyBCdWlsZCB0aGUgcGx1Z2luIGJ1bmRsZS5cbl8uZWFjaChtb2RpZmllcnMsIGZ1bmN0aW9uIChtb2RpZmllciwgbmFtZSkge1xuXG4gIGV4cG9ydHNbJ2NvbXBvbmVudC1wcm9wcy4nICsgbmFtZSArICcuYm9vdHN0cmFwJ10gPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG5cbiAgICBwbHVnaW4uZXhwb3J0cyA9IFtcbiAgICAgIG5hbWUsXG4gICAgICBmdW5jdGlvbiAocHJvcHMpIHtcbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1vZGlmaWVyLmNsYXNzTmFtZSkpIHtcbiAgICAgICAgICBwcm9wcy5jbGFzc05hbWUgPSB1dGlsLmNsYXNzTmFtZShwcm9wcy5jbGFzc05hbWUsIG1vZGlmaWVyLmNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1vZGlmaWVyLmxhYmVsKSkge1xuICAgICAgICAgIHByb3BzLmxhYmVsID0gbW9kaWZpZXIubGFiZWw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICBdO1xuICB9O1xuXG59KTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBkZWZhdWx0LXN0eWxlXG5cbi8qXG5UaGUgZGVmYXVsdC1zdHlsZSBwbHVnaW4gYnVuZGxlIGV4cG9ydHMgYSBidW5jaCBvZiBcInByb3AgbW9kaWZpZXJcIiBwbHVnaW5zIHdoaWNoXG5tYW5pcHVsYXRlIHRoZSBwcm9wcyBnb2luZyBpbnRvIG1hbnkgb2YgdGhlIGNvbXBvbmVudHMuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG52YXIgbW9kaWZpZXJzID0ge1xuXG4gICdmaWVsZCc6IHt9LFxuICAnaGVscCc6IHt9LFxuICAnc2FtcGxlJzoge30sXG4gICd0ZXh0Jzoge30sXG4gICd0ZXh0YXJlYSc6IHt9LFxuICAncHJldHR5LXRleHRhcmVhJzoge30sXG4gICdqc29uJzoge30sXG4gICdzZWxlY3QnOiB7fSxcbiAgJ2xpc3QnOiB7fSxcbiAgJ2xpc3QtY29udHJvbCc6IHt9LFxuICAnbGlzdC1pdGVtLWNvbnRyb2wnOiB7fSxcbiAgJ2xpc3QtaXRlbS12YWx1ZSc6IHt9LFxuICAnbGlzdC1pdGVtJzoge30sXG4gICdpdGVtLWNob2ljZXMnOiB7fSxcbiAgJ2FkZC1pdGVtJzoge30sXG4gICdyZW1vdmUtaXRlbSc6IHt9LFxuICAnbW92ZS1pdGVtLWJhY2snOiB7fSxcbiAgJ21vdmUtaXRlbS1mb3J3YXJkJzoge31cbn07XG5cbi8vIEJ1aWxkIHRoZSBwbHVnaW4gYnVuZGxlLlxuXy5lYWNoKG1vZGlmaWVycywgZnVuY3Rpb24gKG1vZGlmaWVyLCBuYW1lKSB7XG5cbiAgZXhwb3J0c1snY29tcG9uZW50LXByb3BzLicgKyBuYW1lICsgJy5kZWZhdWx0J10gPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG5cbiAgICBwbHVnaW4uZXhwb3J0cyA9IFtcbiAgICAgIG5hbWUsXG4gICAgICBmdW5jdGlvbiAocHJvcHMpIHtcbiAgICAgICAgcHJvcHMuY2xhc3NOYW1lID0gdXRpbC5jbGFzc05hbWUocHJvcHMuY2xhc3NOYW1lLCBuYW1lKTtcbiAgICAgIH1cbiAgICBdO1xuICB9O1xuXG59KTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8gIyBzdG9yZS5tZW1vcnlcblxuLypcblRoZSBtZW1vcnkgc3RvcmUgcGx1Z2luIGtlZXBzIHRoZSBzdGF0ZSBvZiBmaWVsZHMsIGRhdGEsIGFuZCBtZXRhZGF0YS4gSXRcbnJlc3BvbmRzIHRvIGFjdGlvbnMgYW5kIGVtaXRzIGEgY2hhbmdlIGV2ZW50IGlmIHRoZXJlIGFyZSBhbnkgY2hhbmdlcy5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBsdWdpbikge1xuXG4gIHZhciBjb21waWxlciA9IHBsdWdpbi5yZXF1aXJlKCdjb21waWxlcicpO1xuICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG5cbiAgcGx1Z2luLmV4cG9ydHMgPSBmdW5jdGlvbiAoZm9ybSwgZW1pdHRlciwgb3B0aW9ucykge1xuXG4gICAgdmFyIHN0b3JlID0ge307XG5cbiAgICBzdG9yZS5maWVsZHMgPSBbXTtcbiAgICBzdG9yZS50ZW1wbGF0ZU1hcCA9IHt9O1xuICAgIHN0b3JlLnZhbHVlID0ge307XG4gICAgc3RvcmUubWV0YSA9IHt9O1xuXG4gICAgLy8gSGVscGVyIHRvIHNldHVwIGZpZWxkcy4gRmllbGQgZGVmaW5pdGlvbnMgbmVlZCB0byBiZSBleHBhbmRlZCwgY29tcGlsZWQsXG4gICAgLy8gZXRjLlxuXG4gICAgdmFyIHNldHVwRmllbGRzID0gZnVuY3Rpb24gKGZpZWxkcykge1xuICAgICAgc3RvcmUuZmllbGRzID0gY29tcGlsZXIuZXhwYW5kRmllbGRzKGZpZWxkcyk7XG4gICAgICBzdG9yZS5maWVsZHMgPSBjb21waWxlci5jb21waWxlRmllbGRzKHN0b3JlLmZpZWxkcyk7XG4gICAgICBzdG9yZS50ZW1wbGF0ZU1hcCA9IGNvbXBpbGVyLnRlbXBsYXRlTWFwKHN0b3JlLmZpZWxkcyk7XG4gICAgICBzdG9yZS5maWVsZHMgPSBzdG9yZS5maWVsZHMuZmlsdGVyKGZ1bmN0aW9uIChkZWYpIHtcbiAgICAgICAgcmV0dXJuICFkZWYudGVtcGxhdGU7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgaWYgKG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICBzZXR1cEZpZWxkcyhvcHRpb25zLmZpZWxkcyk7XG4gICAgfVxuXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKG9wdGlvbnMudmFsdWUpKSB7XG4gICAgICBzdG9yZS52YWx1ZSA9IHV0aWwuY29weVZhbHVlKG9wdGlvbnMudmFsdWUpO1xuICAgIH1cblxuICAgIHZhciB1cGRhdGUgPSBmdW5jdGlvbiAoY2hhbmdpbmcpIHtcbiAgICAgIGVtaXR0ZXIuZW1pdCgnY2hhbmdlJywge1xuICAgICAgICB2YWx1ZTogc3RvcmUudmFsdWUsXG4gICAgICAgIG1ldGE6IHN0b3JlLm1ldGEsXG4gICAgICAgIGZpZWxkczogc3RvcmUuZmllbGRzLFxuICAgICAgICBjaGFuZ2luZzogY2hhbmdpbmdcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBXaGVuIGZpZWxkcyBjaGFuZ2UsIHdlIG5lZWQgdG8gXCJpbmZsYXRlXCIgdGhlbSwgbWVhbmluZyBleHBhbmQgdGhlbSBhbmRcbiAgICAvLyBydW4gYW55IGV2YWx1YXRpb25zIGluIG9yZGVyIHRvIGdldCB0aGUgZGVmYXVsdCB2YWx1ZSBvdXQuXG4gICAgc3RvcmUuaW5mbGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZCA9IGZvcm0uZmllbGQoKTtcbiAgICAgIGZpZWxkLmluZmxhdGUoZnVuY3Rpb24gKHBhdGgsIHZhbHVlKSB7XG4gICAgICAgIHN0b3JlLnZhbHVlID0gdXRpbC5zZXRJbihzdG9yZS52YWx1ZSwgcGF0aCwgdmFsdWUpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHN0b3JlLm1ldGFLZXlzID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHN0b3JlLm1ldGEpO1xuICAgIH07XG5cbiAgICBzdG9yZS5nZXRNZXRhID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgaWYgKHN0b3JlLm1ldGFba2V5XSAmJiBzdG9yZS5tZXRhW2tleV0uc3RhdHVzID09PSAnbG9hZGVkJykge1xuICAgICAgICByZXR1cm4gc3RvcmUubWV0YVtrZXldLnZhbHVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfTtcblxuICAgIHN0b3JlLmdldE1ldGFTdGF0dXMgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICByZXR1cm4gKHN0b3JlLm1ldGFba2V5XSAmJiBzdG9yZS5tZXRhW2tleV0uc3RhdHVzKSB8fCAndW5rbm93bic7XG4gICAgfTtcblxuICAgIHZhciBhY3Rpb25zID0ge1xuXG4gICAgICBzZXRGb3JtVmFsdWU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YXIgb2xkVmFsdWUgPSBzdG9yZS52YWx1ZTtcbiAgICAgICAgc3RvcmUudmFsdWUgPSB1dGlsLmNvcHlWYWx1ZSh2YWx1ZSk7XG4gICAgICAgIHN0b3JlLmluZmxhdGUoKTtcbiAgICAgICAgdXBkYXRlKHtuZXc6IHZhbHVlLCBvbGQ6IG9sZFZhbHVlLCBhY3Rpb246ICdyZXNldCd9KTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIFNldCB2YWx1ZSBhdCBhIHBhdGguXG4gICAgICBzZXRWYWx1ZTogZnVuY3Rpb24gKGZpZWxkLCB2YWx1ZSkge1xuICAgICAgICB2YXIgcGF0aCA9IGZpZWxkLnZhbHVlUGF0aCgpO1xuXG4gICAgICAgIHZhciBvbGRWYWx1ZSA9IHV0aWwuZ2V0SW4oc3RvcmUudmFsdWUsIHBhdGgpO1xuXG4gICAgICAgIHN0b3JlLnZhbHVlID0gdXRpbC5zZXRJbihzdG9yZS52YWx1ZSwgcGF0aCwgdmFsdWUpO1xuXG4gICAgICAgIHVwZGF0ZSh7ZmllbGQ6IGZpZWxkLmRlZiwgcGF0aDogcGF0aCwgbmV3OiB2YWx1ZSwgb2xkOiBvbGRWYWx1ZSwgYWN0aW9uOiAnc2V0J30pO1xuICAgICAgfSxcblxuICAgICAgLy8gUmVtb3ZlIGEgdmFsdWUgYXQgYSBwYXRoLlxuICAgICAgcmVtb3ZlVmFsdWU6IGZ1bmN0aW9uIChmaWVsZCwga2V5KSB7XG4gICAgICAgIHZhciBwYXRoID0gZmllbGQudmFsdWVQYXRoKCkuY29uY2F0KGtleSk7XG5cbiAgICAgICAgdmFyIG9sZFZhbHVlID0gdXRpbC5nZXRJbihzdG9yZS52YWx1ZSwgcGF0aCk7XG4gICAgICAgIHN0b3JlLnZhbHVlID0gdXRpbC5yZW1vdmVJbihzdG9yZS52YWx1ZSwgcGF0aCk7XG5cbiAgICAgICAgdXBkYXRlKHtmaWVsZDogZmllbGQuZGVmLCBwYXRoOiBwYXRoLCBvbGQ6IG9sZFZhbHVlLCBhY3Rpb246ICdyZW1vdmUnfSk7XG4gICAgICB9LFxuXG4gICAgICAvLyBTdG9wcGVkIHVzaW5nIHRoaXMsIGJ1dCBsZWF2aW5nIGl0IGhlcmUgZm9yIG5vdy4gV2FzIGJhZCBpZGVhIHRvXG4gICAgICAvLyBhdXRvbWF0aWNhbGx5IGVyYXNlIHZhbHVlcy4gQnV0IG1pZ2h0IGZpbmQgYSBiZXR0ZXIgd2F5IHRvIGRvIHRoaXMgaW5cbiAgICAgIC8vIHRoZSBmdXR1cmUuXG4gICAgICBlcmFzZVZhbHVlOiBmdW5jdGlvbiAoZmllbGQpIHtcbiAgICAgICAgdmFyIHBhdGggPSBmaWVsZC52YWx1ZVBhdGgoKTtcblxuICAgICAgICBzdG9yZS52YWx1ZSA9IHV0aWwucmVtb3ZlSW4oc3RvcmUudmFsdWUsIHBhdGgpO1xuXG4gICAgICAgIHVwZGF0ZSh7ZmllbGQ6IGZpZWxkLmRlZn0pO1xuICAgICAgfSxcblxuICAgICAgLy8gQXBwZW5kIGEgdmFsdWUgdG8gYW4gYXJyYXkgYXQgYSBwYXRoLlxuICAgICAgYXBwZW5kVmFsdWU6IGZ1bmN0aW9uIChmaWVsZCwgdmFsdWUpIHtcbiAgICAgICAgdmFyIHBhdGggPSBmaWVsZC52YWx1ZVBhdGgoKTtcblxuICAgICAgICB2YXIgb2xkVmFsdWUgPSB1dGlsLmdldEluKHN0b3JlLnZhbHVlLCBwYXRoKTtcbiAgICAgICAgc3RvcmUudmFsdWUgPSB1dGlsLmFwcGVuZEluKHN0b3JlLnZhbHVlLCBwYXRoLCB2YWx1ZSk7XG5cbiAgICAgICAgdXBkYXRlKHtmaWVsZDogZmllbGQuZGVmLCBwYXRoOiBwYXRoLCBuZXc6IHZhbHVlLCBvbGQ6IG9sZFZhbHVlLCBhY3Rpb246ICdhcHBlbmQnfSk7XG4gICAgICB9LFxuXG4gICAgICAvLyBTd2FwIHZhbHVlcyBvZiB0d28ga2V5cy5cbiAgICAgIG1vdmVWYWx1ZTogZnVuY3Rpb24gKGZpZWxkLCBmcm9tS2V5LCB0b0tleSkge1xuICAgICAgICB2YXIgcGF0aCA9IGZpZWxkLnZhbHVlUGF0aCgpO1xuXG4gICAgICAgIHZhciBvbGRWYWx1ZSA9IHV0aWwuZ2V0SW4oc3RvcmUudmFsdWUsIHBhdGgpO1xuICAgICAgICBzdG9yZS52YWx1ZSA9IHV0aWwubW92ZUluKHN0b3JlLnZhbHVlLCBwYXRoLCBmcm9tS2V5LCB0b0tleSk7XG5cbiAgICAgICAgdXBkYXRlKHtmaWVsZDogZmllbGQuZGVmLCBwYXRoOiBwYXRoLCBuZXc6IG9sZFZhbHVlLCBvbGQ6IG9sZFZhbHVlLCBmcm9tS2V5OiBmcm9tS2V5LCB0b0tleTogdG9LZXksIGFjdGlvbjogJ21vdmUnfSk7XG4gICAgICB9LFxuXG4gICAgICAvLyBDaGFuZ2UgYWxsIHRoZSBmaWVsZHMuXG4gICAgICBzZXRGaWVsZHM6IGZ1bmN0aW9uIChmaWVsZHMpIHtcbiAgICAgICAgc2V0dXBGaWVsZHMoZmllbGRzKTtcbiAgICAgICAgc3RvcmUuaW5mbGF0ZSgpO1xuXG4gICAgICAgIHVwZGF0ZSh7YWN0aW9uOiAnc2V0RmllbGRzJ30pO1xuICAgICAgfSxcblxuICAgICAgLy8gU2V0IGEgbWV0YWRhdGEgdmFsdWUgZm9yIGEga2V5LiBPcHRpb25hbGx5IHNldCBzdGF0dXMuXG4gICAgICBzZXRNZXRhOiBmdW5jdGlvbiAoa2V5LCB2YWx1ZSwgc3RhdHVzKSB7XG4gICAgICAgIHN0YXR1cyA9IHN0YXR1cyB8fCAnbG9hZGVkJztcbiAgICAgICAgc3RvcmUubWV0YVtrZXldID0ge1xuICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICBzdGF0dXM6IHN0YXR1c1xuICAgICAgICB9O1xuICAgICAgICB1cGRhdGUoe2FjdGlvbjogJ3NldE1ldGEnfSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIF8uZXh0ZW5kKHN0b3JlLCBhY3Rpb25zKTtcblxuICAgIHJldHVybiBzdG9yZTtcbiAgfTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vICMgdHlwZS5hcnJheVxuXG4vKlxuU3VwcG9ydCBhcnJheSB0eXBlIHdoZXJlIGNoaWxkIGZpZWxkcyBhcmUgZHluYW1pY2FsbHkgZGV0ZXJtaW5lZCBiYXNlZCBvbiB0aGVcbnZhbHVlcyBvZiB0aGUgYXJyYXkuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cy5kZWZhdWx0ID0gW107XG5cbiAgcGx1Z2luLmV4cG9ydHMuZmllbGRzID0gZnVuY3Rpb24gKGZpZWxkKSB7XG5cbiAgICBpZiAoXy5pc0FycmF5KGZpZWxkLnZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZpZWxkLnZhbHVlLm1hcChmdW5jdGlvbiAodmFsdWUsIGkpIHtcbiAgICAgICAgdmFyIGl0ZW0gPSBmaWVsZC5pdGVtRm9yVmFsdWUodmFsdWUpO1xuICAgICAgICBpdGVtLmtleSA9IGk7XG4gICAgICAgIHJldHVybiBmaWVsZC5jcmVhdGVDaGlsZChpdGVtKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICB9O1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gIyB0eXBlLmJvb2xlYW5cblxuLypcblN1cHBvcnQgYSB0cnVlL2ZhbHNlIHZhbHVlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cy5kZWZhdWx0ID0gZmFsc2U7XG5cbiAgcGx1Z2luLmV4cG9ydHMuY29tcGlsZSA9IGZ1bmN0aW9uIChkZWYpIHtcbiAgICBpZiAoIWRlZi5jaG9pY2VzKSB7XG4gICAgICBkZWYuY2hvaWNlcyA9IFtcbiAgICAgICAge3ZhbHVlOiB0cnVlLCBsYWJlbDogJ1llcyd9LFxuICAgICAgICB7dmFsdWU6IGZhbHNlLCBsYWJlbDogJ05vJ31cbiAgICAgIF07XG4gICAgfVxuICB9O1xufTtcbiIsIi8vICMgdHlwZS5qc29uXG5cbi8qXG5BcmJpdHJhcnkgSlNPTiB2YWx1ZS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMuZGVmYXVsdCA9IG51bGw7XG5cbn07XG4iLCIvLyAjIHR5cGUuc3RyaW5nXG5cbi8qXG5TdXBwb3J0IHN0cmluZyB2YWx1ZXMsIG9mIGNvdXJzZS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMuZGVmYXVsdCA9IG51bGw7XG5cbn07XG4iLCIvLyAjIHR5cGUubnVtYmVyXG5cbi8qXG5TdXBwb3J0IG51bWJlciB2YWx1ZXMsIG9mIGNvdXJzZS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMuZGVmYXVsdCA9IDA7XG5cbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vLyAjIHR5cGUub2JqZWN0XG5cbi8qXG5TdXBwb3J0IGZvciBvYmplY3QgdHlwZXMuIE9iamVjdCBmaWVsZHMgY2FuIHN1cHBseSBzdGF0aWMgY2hpbGQgZmllbGRzLCBvciBpZlxudGhlcmUgYXJlIGFkZGl0aW9uYWwgY2hpbGQga2V5cywgZHluYW1pYyBjaGlsZCBmaWVsZHMgd2lsbCBiZSBjcmVhdGVkIG11Y2hcbmxpa2UgYW4gYXJyYXkuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICB2YXIgdXRpbCA9IHBsdWdpbi5yZXF1aXJlKCd1dGlsJyk7XG5cbiAgcGx1Z2luLmV4cG9ydHMuZGVmYXVsdCA9IHt9O1xuXG4gIHBsdWdpbi5leHBvcnRzLmZpZWxkcyA9IGZ1bmN0aW9uIChmaWVsZCkge1xuXG4gICAgdmFyIGZpZWxkcyA9IFtdO1xuICAgIHZhciB2YWx1ZSA9IGZpZWxkLnZhbHVlO1xuICAgIHZhciB1bnVzZWRLZXlzID0gXy5rZXlzKHZhbHVlKTtcblxuICAgIGlmIChmaWVsZC5kZWYuZmllbGRzKSB7XG5cbiAgICAgIGZpZWxkcyA9IGZpZWxkLmRlZi5maWVsZHMubWFwKGZ1bmN0aW9uIChkZWYpIHtcbiAgICAgICAgdmFyIGNoaWxkID0gZmllbGQuY3JlYXRlQ2hpbGQoZGVmKTtcbiAgICAgICAgaWYgKCF1dGlsLmlzQmxhbmsoY2hpbGQuZGVmLmtleSkpIHtcbiAgICAgICAgICB1bnVzZWRLZXlzID0gXy53aXRob3V0KHVudXNlZEtleXMsIGNoaWxkLmRlZi5rZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjaGlsZDtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICh1bnVzZWRLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHVudXNlZEtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHZhciBpdGVtID0gZmllbGQuaXRlbUZvclZhbHVlKHZhbHVlW2tleV0pO1xuICAgICAgICBpdGVtLmxhYmVsID0gdXRpbC5odW1hbml6ZShrZXkpO1xuICAgICAgICBpdGVtLmtleSA9IGtleTtcbiAgICAgICAgZmllbGRzLnB1c2goZmllbGQuY3JlYXRlQ2hpbGQoaXRlbSkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpZWxkcztcbiAgfTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8vICMgdHlwZS5yb290XG5cbi8qXG5TcGVjaWFsIHR5cGUgcmVwcmVzZW50aW5nIHRoZSByb290IG9mIHRoZSBmb3JtLiBHZXRzIHRoZSBmaWVsZHMgZGlyZWN0bHkgZnJvbVxudGhlIHN0b3JlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcblxuICBwbHVnaW4uZXhwb3J0cy5maWVsZHMgPSBmdW5jdGlvbiAoZmllbGQpIHtcblxuICAgIHJldHVybiBmaWVsZC5mb3JtLnN0b3JlLmZpZWxkcy5tYXAoZnVuY3Rpb24gKGRlZikge1xuICAgICAgcmV0dXJuIGZpZWxkLmNyZWF0ZUNoaWxkKGRlZik7XG4gICAgfSk7XG5cbiAgfTtcbn07XG4iLCIvLyAjIHR5cGUuc3RyaW5nXG5cbi8qXG5TdXBwb3J0IHN0cmluZyB2YWx1ZXMsIG9mIGNvdXJzZS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG5cbiAgcGx1Z2luLmV4cG9ydHMuZGVmYXVsdCA9ICcnO1xuXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFJlcHJlc2VudGF0aW9uIG9mIGEgc2luZ2xlIEV2ZW50RW1pdHRlciBmdW5jdGlvbi5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmbiBFdmVudCBoYW5kbGVyIHRvIGJlIGNhbGxlZC5cbiAqIEBwYXJhbSB7TWl4ZWR9IGNvbnRleHQgQ29udGV4dCBmb3IgZnVuY3Rpb24gZXhlY3V0aW9uLlxuICogQHBhcmFtIHtCb29sZWFufSBvbmNlIE9ubHkgZW1pdCBvbmNlXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gRUUoZm4sIGNvbnRleHQsIG9uY2UpIHtcbiAgdGhpcy5mbiA9IGZuO1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuICB0aGlzLm9uY2UgPSBvbmNlIHx8IGZhbHNlO1xufVxuXG4vKipcbiAqIE1pbmltYWwgRXZlbnRFbWl0dGVyIGludGVyZmFjZSB0aGF0IGlzIG1vbGRlZCBhZ2FpbnN0IHRoZSBOb2RlLmpzXG4gKiBFdmVudEVtaXR0ZXIgaW50ZXJmYWNlLlxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICogQGFwaSBwdWJsaWNcbiAqL1xuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkgeyAvKiBOb3RoaW5nIHRvIHNldCAqLyB9XG5cbi8qKlxuICogSG9sZHMgdGhlIGFzc2lnbmVkIEV2ZW50RW1pdHRlcnMgYnkgbmFtZS5cbiAqXG4gKiBAdHlwZSB7T2JqZWN0fVxuICogQHByaXZhdGVcbiAqL1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fZXZlbnRzID0gdW5kZWZpbmVkO1xuXG4vKipcbiAqIFJldHVybiBhIGxpc3Qgb2YgYXNzaWduZWQgZXZlbnQgbGlzdGVuZXJzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBUaGUgZXZlbnRzIHRoYXQgc2hvdWxkIGJlIGxpc3RlZC5cbiAqIEByZXR1cm5zIHtBcnJheX1cbiAqIEBhcGkgcHVibGljXG4gKi9cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24gbGlzdGVuZXJzKGV2ZW50KSB7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbZXZlbnRdKSByZXR1cm4gW107XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB0aGlzLl9ldmVudHNbZXZlbnRdLmxlbmd0aCwgZWUgPSBbXTsgaSA8IGw7IGkrKykge1xuICAgIGVlLnB1c2godGhpcy5fZXZlbnRzW2V2ZW50XVtpXS5mbik7XG4gIH1cblxuICByZXR1cm4gZWU7XG59O1xuXG4vKipcbiAqIEVtaXQgYW4gZXZlbnQgdG8gYWxsIHJlZ2lzdGVyZWQgZXZlbnQgbGlzdGVuZXJzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBUaGUgbmFtZSBvZiB0aGUgZXZlbnQuXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gSW5kaWNhdGlvbiBpZiB3ZSd2ZSBlbWl0dGVkIGFuIGV2ZW50LlxuICogQGFwaSBwdWJsaWNcbiAqL1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24gZW1pdChldmVudCwgYTEsIGEyLCBhMywgYTQsIGE1KSB7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbZXZlbnRdKSByZXR1cm4gZmFsc2U7XG5cbiAgdmFyIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1tldmVudF1cbiAgICAsIGxlbmd0aCA9IGxpc3RlbmVycy5sZW5ndGhcbiAgICAsIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGhcbiAgICAsIGVlID0gbGlzdGVuZXJzWzBdXG4gICAgLCBhcmdzXG4gICAgLCBpLCBqO1xuXG4gIGlmICgxID09PSBsZW5ndGgpIHtcbiAgICBpZiAoZWUub25jZSkgdGhpcy5yZW1vdmVMaXN0ZW5lcihldmVudCwgZWUuZm4sIHRydWUpO1xuXG4gICAgc3dpdGNoIChsZW4pIHtcbiAgICAgIGNhc2UgMTogcmV0dXJuIGVlLmZuLmNhbGwoZWUuY29udGV4dCksIHRydWU7XG4gICAgICBjYXNlIDI6IHJldHVybiBlZS5mbi5jYWxsKGVlLmNvbnRleHQsIGExKSwgdHJ1ZTtcbiAgICAgIGNhc2UgMzogcmV0dXJuIGVlLmZuLmNhbGwoZWUuY29udGV4dCwgYTEsIGEyKSwgdHJ1ZTtcbiAgICAgIGNhc2UgNDogcmV0dXJuIGVlLmZuLmNhbGwoZWUuY29udGV4dCwgYTEsIGEyLCBhMyksIHRydWU7XG4gICAgICBjYXNlIDU6IHJldHVybiBlZS5mbi5jYWxsKGVlLmNvbnRleHQsIGExLCBhMiwgYTMsIGE0KSwgdHJ1ZTtcbiAgICAgIGNhc2UgNjogcmV0dXJuIGVlLmZuLmNhbGwoZWUuY29udGV4dCwgYTEsIGEyLCBhMywgYTQsIGE1KSwgdHJ1ZTtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAxLCBhcmdzID0gbmV3IEFycmF5KGxlbiAtMSk7IGkgPCBsZW47IGkrKykge1xuICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgfVxuXG4gICAgZWUuZm4uYXBwbHkoZWUuY29udGV4dCwgYXJncyk7XG4gIH0gZWxzZSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAobGlzdGVuZXJzW2ldLm9uY2UpIHRoaXMucmVtb3ZlTGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyc1tpXS5mbiwgdHJ1ZSk7XG5cbiAgICAgIHN3aXRjaCAobGVuKSB7XG4gICAgICAgIGNhc2UgMTogbGlzdGVuZXJzW2ldLmZuLmNhbGwobGlzdGVuZXJzW2ldLmNvbnRleHQpOyBicmVhaztcbiAgICAgICAgY2FzZSAyOiBsaXN0ZW5lcnNbaV0uZm4uY2FsbChsaXN0ZW5lcnNbaV0uY29udGV4dCwgYTEpOyBicmVhaztcbiAgICAgICAgY2FzZSAzOiBsaXN0ZW5lcnNbaV0uZm4uY2FsbChsaXN0ZW5lcnNbaV0uY29udGV4dCwgYTEsIGEyKTsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgaWYgKCFhcmdzKSBmb3IgKGogPSAxLCBhcmdzID0gbmV3IEFycmF5KGxlbiAtMSk7IGogPCBsZW47IGorKykge1xuICAgICAgICAgICAgYXJnc1tqIC0gMV0gPSBhcmd1bWVudHNbal07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGlzdGVuZXJzW2ldLmZuLmFwcGx5KGxpc3RlbmVyc1tpXS5jb250ZXh0LCBhcmdzKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBuZXcgRXZlbnRMaXN0ZW5lciBmb3IgdGhlIGdpdmVuIGV2ZW50LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBOYW1lIG9mIHRoZSBldmVudC5cbiAqIEBwYXJhbSB7RnVuY3Rvbn0gZm4gQ2FsbGJhY2sgZnVuY3Rpb24uXG4gKiBAcGFyYW0ge01peGVkfSBjb250ZXh0IFRoZSBjb250ZXh0IG9mIHRoZSBmdW5jdGlvbi5cbiAqIEBhcGkgcHVibGljXG4gKi9cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBmdW5jdGlvbiBvbihldmVudCwgZm4sIGNvbnRleHQpIHtcbiAgaWYgKCF0aGlzLl9ldmVudHMpIHRoaXMuX2V2ZW50cyA9IHt9O1xuICBpZiAoIXRoaXMuX2V2ZW50c1tldmVudF0pIHRoaXMuX2V2ZW50c1tldmVudF0gPSBbXTtcbiAgdGhpcy5fZXZlbnRzW2V2ZW50XS5wdXNoKG5ldyBFRSggZm4sIGNvbnRleHQgfHwgdGhpcyApKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkIGFuIEV2ZW50TGlzdGVuZXIgdGhhdCdzIG9ubHkgY2FsbGVkIG9uY2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IE5hbWUgb2YgdGhlIGV2ZW50LlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gQ2FsbGJhY2sgZnVuY3Rpb24uXG4gKiBAcGFyYW0ge01peGVkfSBjb250ZXh0IFRoZSBjb250ZXh0IG9mIHRoZSBmdW5jdGlvbi5cbiAqIEBhcGkgcHVibGljXG4gKi9cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uIG9uY2UoZXZlbnQsIGZuLCBjb250ZXh0KSB7XG4gIGlmICghdGhpcy5fZXZlbnRzKSB0aGlzLl9ldmVudHMgPSB7fTtcbiAgaWYgKCF0aGlzLl9ldmVudHNbZXZlbnRdKSB0aGlzLl9ldmVudHNbZXZlbnRdID0gW107XG4gIHRoaXMuX2V2ZW50c1tldmVudF0ucHVzaChuZXcgRUUoZm4sIGNvbnRleHQgfHwgdGhpcywgdHJ1ZSApKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlIGV2ZW50IGxpc3RlbmVycy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgVGhlIGV2ZW50IHdlIHdhbnQgdG8gcmVtb3ZlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gVGhlIGxpc3RlbmVyIHRoYXQgd2UgbmVlZCB0byBmaW5kLlxuICogQHBhcmFtIHtCb29sZWFufSBvbmNlIE9ubHkgcmVtb3ZlIG9uY2UgbGlzdGVuZXJzLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uIHJlbW92ZUxpc3RlbmVyKGV2ZW50LCBmbiwgb25jZSkge1xuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW2V2ZW50XSkgcmV0dXJuIHRoaXM7XG5cbiAgdmFyIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1tldmVudF1cbiAgICAsIGV2ZW50cyA9IFtdO1xuXG4gIGlmIChmbikgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChsaXN0ZW5lcnNbaV0uZm4gIT09IGZuICYmIGxpc3RlbmVyc1tpXS5vbmNlICE9PSBvbmNlKSB7XG4gICAgICBldmVudHMucHVzaChsaXN0ZW5lcnNbaV0pO1xuICAgIH1cbiAgfVxuXG4gIC8vXG4gIC8vIFJlc2V0IHRoZSBhcnJheSwgb3IgcmVtb3ZlIGl0IGNvbXBsZXRlbHkgaWYgd2UgaGF2ZSBubyBtb3JlIGxpc3RlbmVycy5cbiAgLy9cbiAgaWYgKGV2ZW50cy5sZW5ndGgpIHRoaXMuX2V2ZW50c1tldmVudF0gPSBldmVudHM7XG4gIGVsc2UgdGhpcy5fZXZlbnRzW2V2ZW50XSA9IG51bGw7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJlbW92ZSBhbGwgbGlzdGVuZXJzIG9yIG9ubHkgdGhlIGxpc3RlbmVycyBmb3IgdGhlIHNwZWNpZmllZCBldmVudC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgVGhlIGV2ZW50IHdhbnQgdG8gcmVtb3ZlIGFsbCBsaXN0ZW5lcnMgZm9yLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbiByZW1vdmVBbGxMaXN0ZW5lcnMoZXZlbnQpIHtcbiAgaWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiB0aGlzO1xuXG4gIGlmIChldmVudCkgdGhpcy5fZXZlbnRzW2V2ZW50XSA9IG51bGw7XG4gIGVsc2UgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vL1xuLy8gQWxpYXMgbWV0aG9kcyBuYW1lcyBiZWNhdXNlIHBlb3BsZSByb2xsIGxpa2UgdGhhdC5cbi8vXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9mZiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXI7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbjtcblxuLy9cbi8vIFRoaXMgZnVuY3Rpb24gZG9lc24ndCBhcHBseSBhbnltb3JlLlxuLy9cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24gc2V0TWF4TGlzdGVuZXJzKCkge1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8vXG4vLyBFeHBvc2UgdGhlIG1vZHVsZS5cbi8vXG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlcjIgPSBFdmVudEVtaXR0ZXI7XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyMyA9IEV2ZW50RW1pdHRlcjtcblxuaWYgKCdvYmplY3QnID09PSB0eXBlb2YgbW9kdWxlICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gIG1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9mb3JtYXRpYycpO1xuIl19
