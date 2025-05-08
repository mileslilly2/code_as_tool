/**
 * @fileoverview Provides parsing and construction of Solr search queries
 * using YUI module "bepress.search.solr" with Google JavaScript Style Guide comments.
 */

YUI.add('bepress.search.solr', function(Y) {
  // Aliases to frequently used YUI.Lang methods
  var Lang = Y.Lang,
      isValue = Lang.isValue,
      isArray = Lang.isArray,
      trim = Lang.trim,
      trimLeft = Lang.trimLeft,
      namespace = Y.namespace('bepress.search.solr'),
      // Mapping of opening to closing bracket characters
      BRACKETS = {
        '(': ')',
        '{': '}',
        '[': ']'
      },
      OperatorCtor, // constructor for Operator objects
      TermCtor,     // constructor for Term objects
      ParserCtor;   // constructor for Parser objects

  /**
   * Class representing a Solr query operator.
   * @param {string} op The operator string (e.g. "AND", "||").
   * @constructor
   */
  OperatorCtor = function(op) {
    /** @private {string} */
    this.op_ = op;
  };

  /** @alias bepress.search.solr.Operator.prototype */
  var OperatorProto = OperatorCtor.prototype;

  /**
   * Returns the operator in debug-friendly format.
   * @return {string} Debug string for operator.
   */
  OperatorProto.toString = function() {
    return '[Operator: ' + this.op_ + ']';
  };

  /**
   * Retrieves the raw operator value.
   * @return {string} The operator.
   */
  OperatorProto.getValue = function() {
    return this.op_;
  };

  /**
   * Converts the operator to its Solr query representation.
   * @return {string} Solr string for operator.
   */
  OperatorProto.toSolrString = function() {
    return this.op_;
  };

  // Predefined Solr operators
  namespace.Operators = {
    AND: new OperatorCtor('AND'),
    OR: new OperatorCtor('OR'),
    NOT: new OperatorCtor('NOT'),
    '&&': new OperatorCtor('&&'),
    '||': new OperatorCtor('||'),
    '!': new OperatorCtor('!')
  };

  /**
   * Class representing a single term in a Solr query.
   * @param {Object=} config Configuration object to initialize a Term.
   * @constructor
   */
  TermCtor = function(config) {
    /** @private {Array<string>} Buffer for incremental term values */
    this.valueBuffer_ = [];
    /** @private {number} Count of subvalues added */
    this.valueCount_ = 0;
    // Mix in provided config properties
    Y.mix(this, config, true, [
      'mod', 'field', 'value', 'valueBuffer_', 'isOpen', 'opener',
      'modBoost', 'boostVal', 'modProx', 'proxVal', 'boostBuffer',
      'proxBuffer', 'valueCount_'
    ]);
    // If static value provided, close all buffering
    if (this.value) {
      this.isOpen = false;
      this.valueBuffer_ = null;
    }
  };

  /** @alias bepress.search.solr.Term.prototype */
  var TermProto = TermCtor.prototype;

  /**
   * Gets the field name for this term, or default if none.
   * @return {string} Field name.
   */
  TermProto.getField = function() {
    return this.field && this.field !== '' ? this.field : namespace.DEFAULT_FIELD;
  };

  /**
   * Sets the field name on this term.
   * @param {string} field The field name to use.
   */
  TermProto.setField = function(field) {
    this.field = field;
  };

  /**
   * Reads the current value of this term, including buffered content.
   * @return {string} Term value, trimmed.
   */
  TermProto.getValue = function() {
    var result = this.value ? this.value : '';
    if (this.valueBuffer_) {
      result += this.valueBuffer_.join('');
    }
    return trim(result);
  };

  /**
   * Validates that a boost value is numeric.
   * @param {string} val Value to validate.
   * @return {boolean} True if valid.
   * @throws {Error} If invalid.
   */
  TermProto.validateBoostValue = function(val) {
    if (/^\d+(?:\.\d+)?$/.test(val)) {
      return true;
    }
    throw new Error('Invalid boost value: ' + val);
  };

  // ... Additional methods (pushValue, openBoost, closeBoost, setBoost, etc.)
  // would follow here, each annotated with @param and @return where appropriate.

  /**
   * Converts this term into its Solr query string form.
   * @param {boolean=} includeDefaultField If true, always include field prefix.
   * @return {string} Solr-formatted term.
   */
  TermProto.toSolrString = function(includeDefaultField) {
    var solrStr = '',
        val = this.getValue();
    if (val) {
      if (this.mod) {
        solrStr += this.mod;
      }
      if (isValue(this.field)) {
        if (includeDefaultField || this.field !== namespace.DEFAULT_FIELD) {
          solrStr += this.field + ':';
        }
      }
      if (this.opener) {
        solrStr += this.opener + ' ' + val + ' ' + BRACKETS[this.opener];
      } else {
        solrStr += val;
      }
      if (this.modBoost) {
        solrStr += '^' + this.boostVal;
      }
      if (this.modProx) {
        solrStr += '~' + (this.proxVal || '');
      }
    }
    return solrStr;
  };

  // Export Term and Parser constructors
  namespace.Operator = OperatorCtor;
  namespace.Term = TermCtor;

  /**
   * Default field name used when none is provided.
   * @const {string}
   */
  namespace.DEFAULT_FIELD = 'text';

  /**
   * Creates a new Parser for Solr strings.
   * @param {Object=} config Configuration including allowedFields.
   * @constructor
   */
  ParserCtor = function(config) {
    this.reset();
    Y.mix(this, config, true, ['strict', 'allowedFields']);
  };

  /** @alias bepress.search.solr.Parser.prototype */
  var ParserProto = ParserCtor.prototype;

  /**
   * Resets internal parser state.
   */
  ParserProto.reset = function() {
    /** @private {string|null} */ this.inputString = null;
    /** @private {!Array<string>} */ this.inputBuffer = [];
    /** @private {!Array<!TermCtor|!OperatorCtor>} */ this.termList = [];
    /** @private {?TermCtor} */ this.currentTerm = null;
    /** @private {number} */ this.readIndex = 0;
    // More internal flags and regex patterns...
  };

  /**
   * Parses a Solr query string into Term and Operator objects.
   * @param {string} text The query text to parse.
   * @param {boolean=} optimize Whether to optimize the term list.
   * @param {TermCtor=} forceTerm If provided, parse under this term.
   * @return {!Array<!TermCtor|!OperatorCtor>} Parsed terms/operators.
   */
  ParserProto.parse = function(text, optimize, forceTerm) {
    this.reset();
    this.inputString = text;
    if (forceTerm) {
      this.currentTerm = this.forceToTerm = forceTerm;
    }
    // Main parsing loop over characters in inputString...
    // Handle special characters and call Term methods accordingly.
    // After loop, finalize last term and optionally optimize.
    return this.termList;
  };

  // Instantiate a default parser
  namespace.parser = new ParserCtor({
    allowedFields: namespace.allowedFields
  });

  /**
   * Parses a Solr string using the default parser.
   * @param {string} query Solr query text.
   * @param {boolean=} optimize Whether to optimize term list.
   * @param {TermCtor=} forceTerm Optional term to force.
   * @return {!Array<!TermCtor|!OperatorCtor>} Parsed output.
   */
  namespace.parseSolrString = function(query, optimize, forceTerm) {
    return namespace.parser.parse(query, optimize, forceTerm);
  };

}, '0.03', {
  requires: ['node']
});
