describe('select server profile', function () {
  'use strict';

  beforeEach(module('server'));

  describe('select server profile step ctrl', function () {
    var $scope, $stepInstance, data, off;

    beforeEach(inject(function ($rootScope, $controller) {
      $scope = $rootScope.$new();
      $stepInstance = {
        transition: jasmine.createSpy('transition')
      };
      off = jasmine.createSpy('off');
      data = {
        hostProfileSpark: {
          onValue: jasmine.createSpy('onValue').andReturn(off)
        }
      };

      $controller('SelectServerProfileStepCtrl', {
        $scope: $scope,
        $stepInstance: $stepInstance,
        data: data
      });
    }));

    it('should contain a transition method', function () {
      expect($scope.selectServerProfile.transition).toEqual(jasmine.any(Function));
    });

    it('should contain an onSelected method', function () {
      expect($scope.selectServerProfile.onSelected).toEqual(jasmine.any(Function));
    });

    it('should contain a getHostPath method', function () {
      expect($scope.selectServerProfile.getHostPath).toEqual(jasmine.any(Function));
    });

    it('should contain a pdshUpdate method', function () {
      expect($scope.selectServerProfile.pdshUpdate).toEqual(jasmine.any(Function));
    });

    it('should call data.hostProfileSpark.onValue', function () {
      expect(data.hostProfileSpark.onValue).toHaveBeenCalledOnceWith('data', jasmine.any(Function));
    });

    describe('transition', function () {
      var action;
      beforeEach(function () {
        action = 'previous';
        $scope.selectServerProfile.transition(action);
      });

      it('should call off', function () {
        expect(off).toHaveBeenCalledOnce();
      });

      it('should call transition on the step instance', function () {
        expect($stepInstance.transition).toHaveBeenCalledOnceWith(action, {
          data: data,
          hostProfileData: $scope.selectServerProfile.data,
          profile: $scope.selectServerProfile.item
        });
      });
    });

    describe('receiving data change on hostProfileSpark', function () {
      var item, response;
      beforeEach(function () {
        response = {
          body: {
            objects: [
              {
                profiles: {
                  base_managed: [
                    {
                      description: 'ZFS must not be installed',
                      result: true
                    }
                  ],
                  base_monitored: [],
                  posix_copytool_worker: [],
                  robinhood_server: []
                }
              }
            ]
          }
        };
        data.hostProfileSpark.onValue.mostRecentCall.args[1](response);
      });

      it('should set the data on the server profile', function () {
        expect($scope.selectServerProfile.data).toEqual(response.body.objects);
      });

      it('should set fancy options', function () {
        expect($scope.selectServerProfile.options).toEqual([
          {
            id: 'base_managed',
            caption: 'Base managed',
            label: 'Incompatible',
            labelType: 'label-danger',
            valid: undefined
          },
          {
            id: 'base_monitored',
            caption: 'Base monitored',
            valid: true
          },
          {
            id: 'posix_copytool_worker',
            caption: 'Posix copytool worker',
            valid: true
          },
          {
            id: 'robinhood_server',
            caption: 'Robinhood server',
            valid: true
          }
        ]);
      });

      describe('onSelected', function () {
        beforeEach(function () {
          item = {
            id: 'base_monitored',
            caption: 'Base monitored'
          };

          $scope.selectServerProfile.onSelected(item);
        });

        it('should set overridden to false', function () {
          expect($scope.selectServerProfile.overridden).toEqual(false);
        });

        it('should set the item on the server profile', function () {
          expect($scope.selectServerProfile.item).toEqual(item);
        });

        it('should set the items', function () {
          expect($scope.selectServerProfile.items).toEqual([
            {
              items: [],
              profile: 'Base monitored',
              profiles: {
                base_managed: [
                  {
                    description: 'ZFS must not be installed',
                    result: true
                  }
                ],
                base_monitored: [],
                posix_copytool_worker: [],
                robinhood_server: []
              },
              valid: true
            }
          ]);
        });
      });
    });

    describe('get host path', function () {
      var item;
      beforeEach(function () {
        item = {
          address: 'address'
        };
      });

      it('should retrieve the host address', function () {
        expect($scope.selectServerProfile.getHostPath(item)).toEqual(item.address);
      });
    });

    describe('pdsh update', function () {
      var pdsh, hostnames, hostnamesHash;
      beforeEach(function () {
        pdsh = 'test[001-002].localdomain';
        hostnames = ['test001.localdomain', 'test002.localdomain'];
        hostnamesHash = {
          'test001.localdomain': 1,
          'test002.localdomain': 1
        };
      });

      describe('without hostnames', function () {
        beforeEach(function () {
          $scope.selectServerProfile.pdshUpdate(pdsh);
        });

        it('should contain the pdsh expression', function () {
          expect($scope.selectServerProfile.pdsh).toEqual(pdsh);
        });

        it('should not have the hostnames', function () {
          expect($scope.selectServerProfile.hostnames).toEqual(undefined);
        });
      });

      describe('with hostnames', function () {
        beforeEach(function () {
          $scope.selectServerProfile.pdshUpdate(pdsh, hostnames, hostnamesHash);
        });

        it('should contain the pdsh expression', function () {
          expect($scope.selectServerProfile.pdsh).toEqual(pdsh);
        });

        it('should have the hostnames', function () {
          expect($scope.selectServerProfile.hostnames).toEqual(hostnames);
        });

        it('should have the hostnamesHash', function () {
          expect($scope.selectServerProfile.hostnamesHash).toEqual(hostnamesHash);
        });
      });
    });
  });

  describe('selectServerProfileStep', function () {
    var $q, $scope, $transition, data, requestSocket, hostProfileData, profile, selectServerProfileStep,
      spark, postPromise;

    beforeEach(inject(function (_selectServerProfileStep_, _$rootScope_, _$q_) {
      $scope = _$rootScope_.$new();
      selectServerProfileStep = _selectServerProfileStep_;
      $q = _$q_;
    }));

    it('should contain the appropriate properties', function () {
      expect(selectServerProfileStep).toEqual({
        templateUrl: 'iml/server/assets/html/select-server-profile-step.html',
        controller: 'SelectServerProfileStepCtrl',
        transition: jasmine.any(Array)
      });
    });

    describe('invoking the transition', function () {
      beforeEach(function () {
        postPromise = $q.when('transition_end');
        spark = {
          sendPost: jasmine.createSpy('sendPost').andReturn(postPromise),
          end: jasmine.createSpy('end')
        };
        requestSocket = jasmine.createSpy('requestSocket').andReturn(spark);
        data = {
          serverSpark: {
            onceValue: jasmine.createSpy('onceValue')
          }
        };
        $transition = {
          steps: {
            serverStatusStep: {}
          },
          end: jasmine.createSpy('end')
        };
        hostProfileData = [
          {
            host: 1
          }
        ];
        profile = {
          caption: 'Base Monitored',
          id: 'base_monitored'
        };
      });

      describe('previous action', function () {
        var result;

        beforeEach(function () {
          $transition.action = 'previous';
          result = _.last(selectServerProfileStep.transition)(
            $transition, data, requestSocket, hostProfileData, profile);
        });

        it('should resolve with the serverStatusStep', function () {
          expect(result).toEqual({
            step: $transition.steps.serverStatusStep,
            resolve: { data: data }
          });
        });
      });

      describe('end action', function () {
        var result;

        beforeEach(function () {
          $transition.action = 'end';

          result = selectServerProfileStep.transition[selectServerProfileStep.transition.length - 1](
            $transition, data, requestSocket, hostProfileData, profile);

          data.serverSpark.onceValue.mostRecentCall.args[1]({
            body: {
              objects: [
                {
                  id: '1',
                  server_profile: {
                    initial_state: 'unconfigured'
                  }
                }
              ]
            }
          });

          $scope.$digest();
        });

        it('should invoke the request socket', function () {
          expect(requestSocket).toHaveBeenCalledOnce();
        });

        it('should listen for value on data', function () {
          expect(data.serverSpark.onceValue).toHaveBeenCalledOnceWith('data', jasmine.any(Function));
        });

        it('should send a post to /host_profile', function () {
          expect(spark.sendPost).toHaveBeenCalledOnceWith('/host_profile', {
            json: {
              objects: [
                {
                  host: 1,
                  profile: 'base_monitored'
                }
              ]
            }
          }, true);
        });

        it('should call $transition.end', function () {
          expect($transition.end).toHaveBeenCalledOnce();
        });

        it('should end the spark', function () {
          expect(spark.end).toHaveBeenCalledOnce();
        });

        it('should receive an undefined response', function () {
          expect(result).toEqual(undefined);
        });
      });
    });
  });
});