// # component.object-item-value

/*
Render the value of an object item.
*/

'use strict';

var React = require('react');
var R = React.DOM;
var cx = React.addons.classSet;

module.exports = React.createClass({

  displayName: 'ObjectItemValue',

  onChangeField: function (newValue, info) {
    this.props.onChange(this.props.itemKey, newValue, info);
  },

  render: function () {
    var config = this.props.config;
    var field = this.props.field;

    return R.div({className: cx(this.props.className)},
      config.createField({field: field, plain: true})
    );
  }
});