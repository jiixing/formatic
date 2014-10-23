'use strict';

var React = require('react');
var R = React.DOM;

module.exports = function (plugin) {

  plugin.exports.component = React.createClass({

    getDefaultProps: function () {
      return {
        className: plugin.config.className
      };
    },
    //
    // getInitialState: function () {
    //   return {
    //     maybeDelete: false
    //   };
    // },
    //
    // onDelete: function () {
    //   var parent = this.props.field.parent;
    //   if (this.props.onDelete) {
    //     this.props.onDelete(this.props.field.index);
    //   }
    //   this.props.form.actions.delete(parent, this.props.field.index);
    // },
    //
    // onMoveUp: function () {
    //   var parent = this.props.field.parent;
    //   if (this.props.onMove) {
    //     this.props.onMove(this.props.field.index, this.props.field.index - 1);
    //   }
    //   this.props.form.actions.move(parent, this.props.field.index, this.props.field.index - 1);
    // },
    //
    // onMoveDown: function () {
    //   var parent = this.props.field.parent;
    //   if (this.props.onMove) {
    //     this.props.onMove(this.props.field.index, this.props.field.index + 1);
    //   }
    //   this.props.form.actions.move(parent, this.props.field.index, this.props.field.index + 1);
    // },
    //
    // onMouseOver: function () {
    //   this.setState({
    //     maybeDelete: true
    //   });
    // },
    //
    // onMouseOut: function () {
    //   this.setState({
    //     maybeDelete: false
    //   });
    // },

    render: function () {
      var field = this.props.field;

      //var parent = this.props.parent;
      //var item = field.field;
      //var form = this.props.form;

      //var className = formatic.className('list-item', plugin.config.className, field.className);

      // var valueClassName = formatic.className('object-value', plugin.config.value_className, field.value_className);
      // var controlClassName = formatic.className('list-control', plugin.config.control_className, field.control_className);
      // var removeClassName = formatic.className('list-control-remove', plugin.config.removeButton_className, field.removeButton_className);
      // var upClassName = formatic.className('list-control-up', plugin.config.upButton_className, field.upButton_className);
      // var downClassName = formatic.className('list-control-down', plugin.config.downButton_className, field.downButton_className);
      //
      // var removeLabel = plugin.configValue('removeButton_label', '[remove]');
      // var upLabel = plugin.configValue('upButton_label', '[up]');
      // var downLabel = plugin.configValue('downButton_label', '[down]');
      return R.div({className: this.props.className},
        formatic.component('list-item-value')({form: this.props.form, field: field, index: this.props.index}),
        formatic.component('list-item-control')({field: field, index: this.props.index, numItems: this.props.numItems, onMove: this.props.onMove, onRemove: this.props.onRemove})
        //,
        // R.div({className: controlClassName},
        //   R.span({className: removeClassName, onMouseOver: this.onMouseOver, onMouseOut: this.onMouseOut, onClick: this.onDelete}, removeLabel),
        //   this.props.field.index > 0 ? R.span({className: upClassName, onClick: this.onMoveUp}, upLabel) : null,
        //   this.props.field.index < (this.props.field.numItems - 1) ? R.span({className: downClassName, onClick: this.onMoveDown}, downLabel) : null
        // )
      );
    }
  });
};