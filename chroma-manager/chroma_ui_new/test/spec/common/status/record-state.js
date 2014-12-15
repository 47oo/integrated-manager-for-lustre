describe('Record State directive', function () {
  'use strict';

  var $scope, element, node, getPopover, i;

  beforeEach(module('status', 'templates', 'ui.bootstrap.tooltip', 'ui.bootstrap.tpls'));

  beforeEach(inject(function ($rootScope, $compile) {
    // Create an instance of the element
    element = '<record-state record-id="host/6" alert-spark="alertSpark" display-type="\'medium\'">' +
      '</record-state>';

    $scope = $rootScope.$new();

    $scope.alertSpark = {
      onValue: jasmine.createSpy('onValue')
    };

    node = $compile(element)($scope);

    // Update the html
    $scope.$digest();

    $scope.$$childHead.recordId = 'host/6';

    getPopover = function getPopover () {
      return node.find('i ~ .popover');
    };

    i = node.find('i');
  }));

  describe('response doesn\'t contain alerts', function () {

    beforeEach(function () {
      var response = {};

      var handler = $scope.alertSpark.onValue.mostRecentCall.args[1];
      handler(response);
    });

    it('should have no alert messages if the response doesn\'t contain a body.', function () {
      expect($scope.$$childHead.recordState.getAlerts().length).toEqual(0);
    });

    it('should not be in error state', function () {
      expect($scope.$$childHead.recordState.isInErrorState()).toEqual(false);
    });
  });

  describe('response contains alerts', function () {
    beforeEach(function () {
      var response = {
        body: {
          objects: [
            {
              alert_item: 'host/6',
              message: 'response message'
            }
          ]
        }
      };

      var handler = $scope.alertSpark.onValue.mostRecentCall.args[1];
      handler(response);
      $scope.$digest();
    });

    it('should have an alert message if the response contains one.', function () {
      expect($scope.$$childHead.recordState.getAlerts()).toEqual(['response message']);
    });

    it('should have a tool tip message', function () {
      expect($scope.$$childHead.recordState.getTooltipMessage()).toEqual('1 alert message. Click to review details.');
    });

    it('should be in error state', function () {
      expect($scope.$$childHead.recordState.isInErrorState()).toEqual(true);
    });

    it('should show the label', function () {
      expect($scope.$$childHead.recordState.showLabel()).toEqual(true);
    });

    it('should show the label in markup', function () {
      expect(node.find('.state-label').hasClass('ng-hide')).toEqual(false);
    });
  });

  describe('exclamation icon interaction', function () {
    var response;

    beforeEach(function () {
      response = {
        body: {
          objects: [
            {
              alert_item: 'host/6',
              message: 'response message'
            }
          ]
        }
      };

      var handler = $scope.alertSpark.onValue.mostRecentCall.args[1];
      handler(response);

      // Update the html
      $scope.$digest();

      i = node.find('i');
    });

    it('should display the info icon', function () {
      expect(i).toBeShown();
    });

    it('should display the popover after clicking info icon', function () {
      i.trigger('click');

      expect(getPopover()).toBeShown();
    });

    it('should display the tooltip after mousing over the info icon', function () {
      i.trigger('mouseover');

      var tooltip = node.find('.tooltip');
      expect(tooltip).toBeShown();
    });
  });

  describe('message updates', function () {
    var response;
    beforeEach(function () {
      response = {
        body: {
          objects: [
            {
              alert_item: 'host/6',
              message: 'response message1'
            }
          ]
        }
      };

      var handler = $scope.alertSpark.onValue.mostRecentCall.args[1];
      handler(response);

      // Change the response to have 2 messages now
      response = {
        body: {
          objects: [
            {
              alert_item: 'host/6',
              message: 'response message1'
            },
            {
              alert_item: 'host/6',
              message: 'response message2'
            }
          ]
        }
      };

      handler(response);

      // Now, remove the first message so that only message 2 remains
      response = {
        body: {
          objects: [
            {
              alert_item: 'host/6',
              message: 'response message2'
            }
          ]
        }
      };

      handler(response);
    });

    it('should contain the second message in the alerts array.', function () {
      expect($scope.$$childHead.recordState.getAlerts()).toEqual(['response message2']);
    });

    it('should contain both messages in the message record.', function () {
      expect($scope.$$childHead.recordState.getMessageRecord()).toEqual(['response message1', 'response message2']);
    });

    it('should contain only message1 in the difference array.', function () {
      expect($scope.$$childHead.recordState.getMessageDifference()).toEqual(['response message1']);
    });
  });

  describe('no display type', function () {
    beforeEach(inject(function ($rootScope, $compile) {
      // Create an instance of the element
      element = '<record-state record-id="host/6" alert-spark="alertSpark"></record-state>';

      $scope = $rootScope.$new();

      $scope.alertSpark = {
        onValue: jasmine.createSpy('onValue')
      };

      node = $compile(element)($scope);

      // Update the html
      $scope.$digest();

      $scope.$$childHead.recordId = 'host/6';
    }));

    describe('response contains alerts', function () {
      beforeEach(function () {
        var response = {
          body: {
            objects: [
              {
                alert_item: 'host/6',
                message: 'response message'
              }
            ]
          }
        };

        var handler = $scope.alertSpark.onValue.mostRecentCall.args[1];
        handler(response);
        $scope.$digest();
      });

      it('should not show the label', function () {
        expect($scope.$$childHead.recordState.showLabel()).toEqual(false);
      });

      it('should not show the label in markup', function () {
        expect(node.find('.state-label').hasClass('ng-hide')).toEqual(true);
      });
    });
  });
});