'use strict';

module.exports = {

  loadNeededMeta: function (props) {
    if (props.field && props.field.form) {
      if (props.field.def.needsMeta && props.field.def.needsMeta.length > 0) {
        props.field.def.needsMeta.forEach(function (keys) {
          if (keys) {
            props.field.form.loadMeta(keys);
          }
        });
      }
    }
  },

  componentDidMount: function () {
    this.loadNeededMeta(this.props);
  },

  componentWillReceiveProps: function (nextProps) {
    this.loadNeededMeta(nextProps);
  },

  componentWillUnmount: function () {
    if (this.props.field) {
      this.props.field.erase();
    }
  }
};