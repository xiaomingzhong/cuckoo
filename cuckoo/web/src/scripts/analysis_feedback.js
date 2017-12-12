/*
 * Copyright (C) 2010-2013 Claudio Guarnieri.
 * Copyright (C) 2014-2016 Cuckoo Foundation.
 * This file is part of Cuckoo Sandbox - http://www.cuckoosandbox.org
 * See the file 'docs/LICENSE' for copying permission.
 *
 */

// will deprecate
var feedbackFormSubmitted = false;

function send_button_toggle() {

 var sel = $('#modal_feedback');

 sel.find("input#submit").toggleClass('sending');

 if(sel.find('input#submit').hasClass('sending')) {
  sel.find('input#submit').attr('disabled', true);
  $("#modal_feedback").find("#result").html('Sending feedback... a moment.');
 } else {
  sel.find('input#submit').attr('disabled', false);
 }
}

// will deprecate
function feedback_send(task_id, name, email, company, message, include_analysis, include_memdump, callback){

    var params = {
        "task_id": task_id,
        "email": email,
        "message": message,
        "name": name,
        "company": company,
        "include_memdump": include_memdump,
        "include_analysis": include_analysis
    };

    CuckooWeb.api_post("/analysis/api/task/feedback_send/", params, function(data){
        callback(data);
    }, function(err){
        if (err.responseJSON.hasOwnProperty("message")){
            let message = err.responseJSON.message;
            $("#modal_feedback").find("#result").html(message);
            send_button_toggle();
            feedbackFormSubmitted = false;
        }

    });

}

// a simple wrapper around the feedback functionality
class FeedbackForm {

  constructor(el) {

    if(!el) {
      console.log('no element applied. Feedback form cannot be used.');
      return;
    }

    this.el = el;
    this.modal = this.el.parents('.modal');

    // default set of params
    this.params = {
      "task_id": task_id || false,
      "email": false,
      "message": false,
      "name": false,
      "company": false,
      "include_memdump": false,
      "include_analysis": false
    }

    // required fields
    this.required = ["name","email","company","message"];

    // updates the inner params
    this.el.find('input,select,textarea').bind('change', e => {
      this.update();
    });

    // submits the form
    this.el.on('submit', e => {

      e.preventDefault();

      this.resetError();
      this.el.find('button[type="submit"]').prop('disabled', true);
      this.el.find('button[type="submit"]').text('Sending...');

      this.send(data => {
        this.reset();
        this.close();
      }, err => {
        this.displayError(err.responseJSON ? err.responseJSON.message : false);
      }, () => {
        this.el.find('button[type="submit"]').prop('disabled', false);
        this.el.find('button[type="submit"]').text('Send feedback report');
      });

    });

    // update on init
    this.update();

    // do a pre-estimate
    this.estimate();

    // re-estimate each time
    this.changed(['include_analysis','include_memdump'], value => {
      this.estimate();
    });

    // cancel the feedback form
    this.modal.find('[href="modal:cancel"]').bind('click', e => {
      e.preventDefault();
      this.cancel();
    });

  }

  // updates params
  update() {
    let self = this;
    this.el.find('input,select,textarea').each(function(i) {
      if(self.params.hasOwnProperty($(this).attr('name'))) {
        let value = $(this).val();
        if($(this).attr('type') !== 'checkbox') {
          self.params[$(this).attr('name')] = $(this).val() || false;
        } else {
          self.params[$(this).attr('name')] = $(this).is(':checked');
        }
      }
    });
  }

  // validates params
  validate() {
    let validated = true;
    for(let req in this.required) {
      if(!this.params[this.required[req]]) {
        validated = false;
        this.el.find(`[name='${this.required[req]}']`).parent().addClass('error');
      } else {
        this.el.find(`[name='${this.required[req]}']`).parent().removeClass('error');
      }
    }
    return validated;
  }

  // sends the data to the backend after validation
  send(then = function(){}, nope = function(){}, always = function(){}) {
    let validated = this.validate();
    if(validated) {
      CuckooWeb.api_post("/analysis/api/task/feedback_send/", this.params, data => {
        then(data);
        always();
      }, err => {
        nope(err);
        always();
      });
    } else {
      this.displayError('Please fill out all the required fields.');
      always();
    }
  }

  // a file inclusion estimation
  estimate() {

    let self = this;

    let analysis = this.params.include_analysis;
    let memory = this.params.include_memdump;

    this.el.find('.file-estimation').text('estimating...');
    this.el.find('[name="include_analysis"],[name="include_memdump"]').prop('disabled', true);

    /*
      I believe underneath code can be done much better backend-wise. Does
      it really need the backend in the first place here?
     */

    // get files
    CuckooWeb.api_post("/analysis/api/task/export_get_files/", {
      task_id: self.params.task_id
    }, data => {

      if(data.dirs) {
        let dirs = [];
        data.dirs = data.dirs.map((obj, i) => {
          // skip 'memory' if include_memdump is toggled to false
          if(obj[0] == "memory" && !memory) return false;
          // don't include anything at all if we disabled analysis
          if(!analysis) return false;
          dirs.push(obj[0]);
        });
        data.dirs = dirs;
      }

      CuckooWeb.api_post("/analysis/api/task/export_estimate_size/", {
        task_id: self.params.task_id,
        dirs: data.dirs,
        files: data.files
      }, estimation => {
        this.el.find('.file-estimation').text(estimation.size_human);
        this.el.find('[name="include_analysis"],[name="include_memdump"]').prop('disabled', false);
      });

    });
  }

  // displays an error
  displayError(message = 'Something went wrong') {
    this.modal.find('.modal-footer').text(message);
    this.modal.find('.modal-footer').prev().addClass('arrow arrow-center');
  }

  // resets an error
  resetError() {
    this.modal.find('.modal-footer').prev().removeClass('arrow arrow-center');
    this.modal.find('.modal-footer').text('');
  }

  // UI controls
  open() {
    this.modal.modal('show');
  }

  close() {
    this.reset();
    this.modal.modal('hide');
  }

  reset() {
    this.el.find('input, textarea').val("");
    this.update();
  }

  cancel() {
    this.reset();
    this.close();
  }

  // this is a very small event handler on changed fields to interact
  // quickly with them.
  changed(paramName = false, cb = function(){}) {
    if(!(paramName instanceof Array)) {
      this.el.find(`[name='${paramName}']`).bind('change', e => {
        cb(this.params[paramName]);
      });
    } else {
      for(let p in paramName) {
        this.el.find(`[name='${paramName[p]}']`).bind('change', e => {
          cb(this.params[paramName[p]]);
        });
      }
    }
  }

}

// instantiate the feedback form
$(function() {
  if($(".modal-cuckoo#feedback_form").length) {
    let form = new FeedbackForm($(".modal-cuckoo#feedback_form form"));
    form.open();
  }
});
