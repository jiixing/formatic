'use strict';

var React = require('react/addons');
var R = React.DOM;
var _ = require('underscore');

module.exports = function (plugin) {

  plugin.exports.component = React.createClass({

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },

    onChange: function (event) {
      this.props.field.val(event.target.value);
    },

    render: function () {

      var field = this.props.field;
      var choices = field.def.choices || [];

      var value = field.value || '';

      if (!value) {
        choices = [{
          value: '',
          label: ''
        }].concat(choices);
      } else {
        var valueChoice = _.find(choices, function (choice) {
          return choice.value === value;
        }.bind(this));
        if (!valueChoice) {
          choices = choices.concat({
            value: value,
            label: value
          });
        }
      }



      return plugin.component('field')({
        field: field
      }, R.select({
        className: this.props.className,
        onChange: this.onChange,
        value: value
      },
        choices.map(function (choice, i) {
          return R.option({
            key: i,
            value: choice.value
          }, choice.label);
        }.bind(this))
      ));
    }
  });
};