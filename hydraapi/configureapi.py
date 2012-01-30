#
# ==============================
# Copyright 2011 Whamcloud, Inc.
# ==============================

from django.contrib.contenttypes.models import ContentType

# Hydra server imports
import settings

from configure.models import ManagedHost
from configure.models import Command
from requesthandler import AnonymousRequestHandler
from hydraapi.requesthandler import APIResponse


class GetJobStatus(AnonymousRequestHandler):
    def run(self, request, job_id):
        from django.shortcuts import get_object_or_404
        from configure.models import Job
        job = get_object_or_404(Job, id = job_id)
        job = job.downcast()
        return {'job_status': job.status, 'job_info': job.info, 'job_result': job.result}


class SetJobStatus(AnonymousRequestHandler):
    def run(self, request, job_id, state):
        assert state in ['pause', 'cancel', 'resume']
        from django.shortcuts import get_object_or_404
        from configure.models import Job
        job = get_object_or_404(Job, id = job_id)
        if state == 'pause':
            job.pause()
        elif state == 'cancel':
            job.cancel()
        else:
            job.resume()
        return {'transition_job_status': job.status, 'job_info': job.info, 'job_result': job.result}


class SetVolumePrimary(AnonymousRequestHandler):
    def run(cls, request, lun_ids, primary_host_ids, secondary_host_ids):
        from configure.models import Lun, LunNode
        from django.shortcuts import get_object_or_404

        def set_usable_luns(lun_id, primary_host_id, secondary_host_id):
            if primary_host_id == secondary_host_id:
                raise AssertionError('Primary host and Secondary host can not be same for a volume lun')
            volume_lun = get_object_or_404(Lun, pk = lun_id)
            from hydraapi import api_log
            api_log.info("primary_host_id = %s" % primary_host_id)
            primary_host = get_object_or_404(ManagedHost, pk = primary_host_id)
            filter_kargs = {'lun': volume_lun, 'host': primary_host}
            primary_lun_node = LunNode.objects.filter(**filter_kargs)
            secondary_host = get_object_or_404(ManagedHost, pk = secondary_host_id)
            filter_kargs = {'lun': volume_lun, 'host': secondary_host}
            secondary_lun_nodes = LunNode.objects.filter(**filter_kargs)
            for p_lun_node in primary_lun_node:
                p_lun_node.set_usable_lun_nodes(secondary_lun_nodes)

        for i in range(len(lun_ids)):
            set_usable_luns(lun_ids.__getitem__(i), primary_host_ids.__getitem__(i), secondary_host_ids.__getitem__(i))


class GetLuns(AnonymousRequestHandler):
    def run(cls, request, category):
        assert category in ['unused', 'usable']

        from configure.models import Lun, LunNode
        from monitor.lib.util import sizeof_fmt
        devices = []
        if category == 'unused':
            luns = Lun.get_unused_luns()
        elif category == 'usable':
            luns = Lun.get_usable_luns()
        else:
            raise RuntimeError("Bad category '%s' in get_unused_luns" % category)

        for lun in luns:
            available_hosts = dict([(ln.host.id, {
                'label': ln.host.__str__(),
                'use': ln.use,
                'primary': ln.primary
                }) for ln in LunNode.objects.filter(lun = lun)])
            devices.append({
                             'id': lun.id,
                             'name': lun.get_label(),
                             'kind': lun.get_kind(),
                             'available_hosts': available_hosts,
                             'size': sizeof_fmt(lun.size),
                             'status': lun.ha_status()
                           })
        return devices


def create_fs(mgs_id, fsname, conf_params):
        from configure.models import ManagedFilesystem, ManagedMgs
        mgs = ManagedMgs.objects.get(id=mgs_id)
        fs = ManagedFilesystem(mgs=mgs, name = fsname)
        fs.save()

        if conf_params:
            set_target_conf_param(fs.id, conf_params, True)
        return fs


class CreateNewFilesystem(AnonymousRequestHandler):
    def run(self, request, fsname, mgt_id, mgt_lun_id, mdt_lun_id, ost_lun_ids, conf_params):
        # mgt_id and mgt_lun_id are mutually exclusive:
        # * mgt_id is a PK of an existing ManagedMgt to use
        # * mgt_lun_id is a PK of a Lun to use for a new ManagedMgt
        assert bool(mgt_id) != bool(mgt_lun_id)

        from configure.models import ManagedMgs, ManagedMdt, ManagedOst

        if not mgt_id:
            mgt = create_target(mgt_lun_id, ManagedMgs, name="MGS")
            mgt_id = mgt.pk
        else:
            mgt_lun_id = ManagedMgs.objects.get(pk = mgt_id).get_lun()

        # This is a brute safety measure, to be superceded by
        # some appropriate validation that gives a helpful
        # error to the user.
        all_lun_ids = [mgt_lun_id] + [mdt_lun_id] + ost_lun_ids
        # Test that all values in all_lun_ids are unique
        assert len(set(all_lun_ids)) == len(all_lun_ids)

        from django.db import transaction
        with transaction.commit_on_success():
            fs = create_fs(mgt_id, fsname, conf_params)
            create_target(mdt_lun_id, ManagedMdt, filesystem = fs)
            osts = []
            for lun_id in ost_lun_ids:
                osts.append(create_target(lun_id, ManagedOst, filesystem = fs))
        # Important that a commit happens here so that the targets
        # land in DB before the set_state jobs act upon them.

        Command.set_state(fs, 'available', "Creating filesystem %s" % fsname)

        return APIResponse({'id': fs.id}, 201)


class CreateMGT(AnonymousRequestHandler):
    def run(self, request, lun_id):
        from configure.models import ManagedMgs
        mgt = create_target(lun_id, ManagedMgs, name = "MGS")

        from django.db import transaction
        transaction.commit()

        from configure.models import Command
        command = Command.set_state(mgt, 'mounted', "Creating MGT")
        return APIResponse(command.to_dict(), 202)


def create_target(lun_id, target_klass, **kwargs):
    from configure.models import Lun, ManagedTargetMount

    target = target_klass(**kwargs)
    target.save()

    lun = Lun.objects.get(pk = lun_id)
    for node in lun.lunnode_set.all():
        if node.use:
            mount = ManagedTargetMount(
                block_device = node,
                target = target,
                host = node.host,
                mount_point = target.default_mount_path(node.host),
                primary = node.primary)
            mount.save()

    return target


class CreateOSTs(AnonymousRequestHandler):
    def run(self, request, filesystem_id, ost_lun_ids):
        from configure.models import ManagedFilesystem, ManagedOst
        from django.db import transaction

        fs = ManagedFilesystem.objects.get(id=filesystem_id)
        osts = []
        with transaction.commit_on_success():
            for lun_id in ost_lun_ids:
                osts.append(create_target(lun_id, ManagedOst, filesystem = fs))

        from configure.lib.state_manager import StateManager
        from configure.models import Command
        with transaction.commit_on_success():
            command = Command(message = "Creating OSTs")
            command.save()
        for target in osts:
            StateManager.set_state(target, 'mounted', command.pk)
        return APIResponse(command.to_dict(), 202)


class SetTargetConfParams(AnonymousRequestHandler):
    def run(self, request, target_id, conf_params, IsFS):
        set_target_conf_param(target_id, conf_params, IsFS)


def set_target_conf_param(target_id, conf_params, IsFS):
    from configure.models import ManagedTarget, ManagedFilesystem, ManagedMdt, ManagedOst
    from django.shortcuts import get_object_or_404
    from configure.models import ApplyConfParams
    from configure.lib.conf_param import all_params
    from configure.lib.state_manager import StateManager

    if IsFS:
        target = get_object_or_404(ManagedFilesystem, pk = target_id)
    else:
        target = get_object_or_404(ManagedTarget, pk = target_id).downcast()

    def handle_conf_param(target, conf_params, mgs, **kwargs):
        for key, val in conf_params.items():
            model_klass, param_value_obj, help_text = all_params[key]
            p = model_klass(key = key,
                            value = val,
                            **kwargs)
            mgs.set_conf_params([p])
            StateManager().add_job(ApplyConfParams(mgs = mgs))

    if IsFS:
        handle_conf_param(target, conf_params, target.mgs.downcast(), filesystem = target)
    elif isinstance(target, ManagedMdt):
        handle_conf_param(target, conf_params, target.filesystem.mgs.downcast(), mdt = target)
    elif isinstance(target, ManagedOst):
        handle_conf_param(target, conf_params, target.filesystem.mgs.downcast(), ost = target)


class GetTargetConfParams(AnonymousRequestHandler):
    def run(self, request, target_id, kinds):
        from configure.lib.conf_param import (FilesystemClientConfParam,
                                              FilesystemGlobalConfParam,
                                              OstConfParam,
                                              MdtConfParam,
                                              get_conf_params,
                                              all_params)
        from configure.models import ManagedFilesystem, ManagedTarget, ManagedMdt, ManagedOst
        from django.shortcuts import get_object_or_404
        kind_map = {"FSC": FilesystemClientConfParam,
                    "FS": FilesystemGlobalConfParam,
                    "OST": OstConfParam,
                    "MDT": MdtConfParam}
        result = []

        def get_conf_param_for_target(target):
            conf_param_result = []
            for conf_param in target.get_conf_params():
                conf_param_result.append({'conf_param': conf_param.key,
                                          'value': conf_param.value,
                                          'conf_param_help': all_params[conf_param.key][2]
                                         }
                                        )
            return conf_param_result

        def search_conf_param(result, conf_param):
            for param in result:
                if param.get('conf_param') == conf_param:
                    return True
            return False

        # Create FS and Edit FS calls are passing kinds as ["FSC", "FS"]
        if kinds == ["FS", "FSC"] and target_id:
                target = get_object_or_404(ManagedFilesystem, pk = target_id).downcast()
                result.extend(get_conf_param_for_target(target))
        elif target_id:
            target = get_object_or_404(ManagedTarget, pk = target_id).downcast()
            if isinstance(target, ManagedMdt):
                result.extend(get_conf_param_for_target(target))
                kinds = ["MDT"]
            elif isinstance(target, ManagedOst):
                result.extend(get_conf_param_for_target(target))
                kinds = ["OST"]
            else:
                return result

        if kinds:
            klasses = []
            for kind in kinds:
                try:
                    klasses.append(kind_map[kind])
                except KeyError:
                    raise RuntimeError("Unknown target kind '%s' (kinds are %s)" % (kind, kind_map.keys()))
        else:
            klasses = kind_map.values()
        for klass in klasses:
            conf_params = get_conf_params([klass])
            for conf_param in conf_params:
                if not search_conf_param(result, conf_param):
                    result.append({'conf_param': conf_param, 'value': '', 'conf_param_help': all_params[conf_param][2]})
        return result


class GetTargetResourceGraph(AnonymousRequestHandler):
    def run(self, request, target_id):
        from monitor.models import AlertState
        from configure.models import ManagedTarget
        from django.shortcuts import get_object_or_404
        target = get_object_or_404(ManagedTarget, pk = target_id).downcast()

        ancestor_records = set()
        parent_records = set()
        storage_alerts = set()
        lustre_alerts = set(AlertState.filter_by_item(target))
        from collections import defaultdict
        rows = defaultdict(list)
        id_edges = []
        for tm in target.managedtargetmount_set.all():
            lustre_alerts |= set(AlertState.filter_by_item(tm))
            lun_node = tm.block_device
            if lun_node.storage_resource:
                parent_record = lun_node.storage_resource
                from configure.lib.storage_plugin.query import ResourceQuery

                parent_records.add(parent_record)

                storage_alerts |= ResourceQuery().record_all_alerts(parent_record)
                ancestor_records |= set(ResourceQuery().record_all_ancestors(parent_record))

                def row_iterate(parent_record, i):
                    if not parent_record in rows[i]:
                        rows[i].append(parent_record)
                    for p in parent_record.parents.all():
                        #if 25 in [parent_record.id, p.id]:
                        #    id_edges.append((parent_record.id, p.id))
                        id_edges.append((parent_record.id, p.id))
                        row_iterate(p, i + 1)
                row_iterate(parent_record, 0)

        for i in range(0, len(rows) - 1):
            this_row = rows[i]
            next_row = rows[i + 1]

            def nextrow_affinity(obj):
                # if this has a link to anything in the next row, what
                # index in the next row?
                for j in range(0, len(next_row)):
                    notional_edge = (obj.id, next_row[j].id)
                    if notional_edge in id_edges:
                        return j
                return None

            this_row.sort(lambda a, b: cmp(nextrow_affinity(a), nextrow_affinity(b)))

        box_width = 120
        box_height = 80
        xborder = 40
        yborder = 40
        xpad = 20
        ypad = 20

        height = 0
        width = len(rows) * box_width + (len(rows) - 1) * xpad
        for i, items in rows.items():
            total_height = len(items) * box_height + (len(items) - 1) * ypad
            height = max(total_height, height)

        height = height + yborder * 2
        width = width + xborder * 2

        edges = [e for e in id_edges]
        nodes = []
        x = 0
        for i, items in rows.items():
            total_height = len(items) * box_height + (len(items) - 1) * ypad
            y = (height - total_height) / 2
            for record in items:
                resource = record.to_resource()
                alert_count = len(ResourceQuery().resource_get_alerts(resource))
                if alert_count != 0:
                    highlight = "#ff0000"
                else:
                    highlight = "#000000"
                nodes.append({
                    'left': x,
                    'top': y,
                    'title': record.alias_or_name(),
                    'icon': "%simages/storage_plugin/%s.png" % (settings.STATIC_URL, resource.icon),
                    'type': resource.get_class_label(),
                    'id': record.id,
                    'highlight': highlight
                    })
                y += box_height + ypad
            x += box_width + xpad

        graph = {
                'edges': edges,
                'nodes': nodes,
                'item_width': box_width,
                'item_height': box_height,
                'width': width,
                'height': height
                }

        return {
            'storage_alerts': [a.to_dict() for a in storage_alerts],
            'lustre_alerts': [a.to_dict() for a in lustre_alerts],
            'graph': graph}


class Notifications(AnonymousRequestHandler):
    def run(self, request, filter_opts):
        since_time = filter_opts['since_time']
        initial = filter_opts['initial']
        # last_check should be a string in the datetime.isoformat() format
        # TODO: use dateutils.parser to accept general ISO8601 (see
        # note in hydracm.context_processors.page_load_time)
        assert (since_time or initial)

        alert_filter_args = []
        alert_filter_kwargs = {}
        job_filter_args = []
        job_filter_kwargs = {}
        if since_time:
            from datetime import datetime
            since_time = datetime.strptime(since_time, "%Y-%m-%dT%H:%M:%S")
            job_filter_kwargs['modified_at__gte'] = since_time
            alert_filter_kwargs['end__gte'] = since_time

        if initial:
            from django.db.models import Q
            job_filter_args.append(~Q(state = 'complete'))
            alert_filter_kwargs['active'] = True

        from configure.models import Job
        jobs = Job.objects.filter(*job_filter_args, **job_filter_kwargs).order_by('-modified_at')
        from monitor.models import AlertState
        alerts = AlertState.objects.filter(*alert_filter_args, **alert_filter_kwargs).order_by('-end')

        # >> FIXME HYD-421 Hack: this info should be provided in a more generic way by
        #    AlertState subclasses
        # NB adding a 'what_do_i_affect' method to
        alert_dicts = []
        for a in alerts:
            a = a.downcast()
            alert_dict = a.to_dict()

            affected_objects = set()

            from configure.models import StorageResourceAlert, StorageAlertPropagated
            from configure.models import Lun
            from configure.models import ManagedTargetMount, ManagedMgs
            from configure.models import FilesystemMember
            from monitor.models import TargetOfflineAlert, TargetRecoveryAlert, TargetFailoverAlert, HostContactAlert

            def affect_target(target):
                target = target.downcast()
                affected_objects.add(target)
                if isinstance(target, FilesystemMember):
                    affected_objects.add(target.filesystem)
                elif isinstance(target, ManagedMgs):
                    for fs in target.managedfilesystem_set.all():
                        affected_objects.add(fs)

            if isinstance(a, StorageResourceAlert):
                affected_srrs = [sap['storage_resource_id'] for sap in StorageAlertPropagated.objects.filter(alert_state = a).values('storage_resource_id')]
                affected_srrs.append(a.alert_item_id)
                luns = Lun.objects.filter(storage_resource__in = affected_srrs)
                for l in luns:
                    for ln in l.lunnode_set.all():
                        tms = ManagedTargetMount.objects.filter(block_device = ln)
                        for tm in tms:
                            affect_target(tm.target)
            elif isinstance(a, TargetFailoverAlert):
                affect_target(a.alert_item.target)
            elif isinstance(a, TargetOfflineAlert) or isinstance(a, TargetRecoveryAlert):
                affect_target(a.alert_item)
            elif isinstance(a, HostContactAlert):
                tms = ManagedTargetMount.objects.filter(host = a.alert_item)
                for tm in tms:
                    affect_target(tm.target)

            alert_dict['affected'] = []
            alert_dict['affected'].append([a.alert_item_id, a.alert_item_type_id])
            for ao in affected_objects:
                ct = ContentType.objects.get_for_model(ao)
                alert_dict['affected'].append([ao.pk, ct.pk])

            alert_dicts.append(alert_dict)
        # <<

        if jobs.count() > 0 and alerts.count() > 0:
            latest_job = jobs[0]
            latest_alert = alerts[0]
            last_modified = max(latest_job.modified_at, latest_alert.end)
        elif jobs.count() > 0:
            latest_job = jobs[0]
            last_modified = latest_job.modified_at
        elif alerts.count() > 0:
            latest_alert = alerts[0]
            last_modified = latest_alert.end
        else:
            last_modified = None

        if last_modified:
            from monitor.lib.util import time_str
            last_modified = time_str(last_modified)

        return {
                'last_modified': last_modified,
                'jobs': [job.to_dict() for job in jobs],
                'alerts': alert_dicts
                }


class TransitionConsequences(AnonymousRequestHandler):
    def run(self, request, id, content_type_id, new_state):
        from configure.lib.state_manager import StateManager
        ct = ContentType.objects.get_for_id(content_type_id)
        klass = ct.model_class()
        instance = klass.objects.get(pk = id)
        return StateManager().get_transition_consequences(instance, new_state)


class Transition(AnonymousRequestHandler):
    def run(self, request, id, content_type_id, new_state):
        klass = ContentType.objects.get_for_id(content_type_id).model_class()
        instance = klass.objects.get(pk = id)

        from configure.models import Command
        command = Command.set_state(instance, new_state)
        return APIResponse(command.to_dict(), 202)


class ObjectSummary(AnonymousRequestHandler):
    def run(self, request, objects):
        result = []
        for o in objects:
            from configure.lib.state_manager import StateManager
            klass = ContentType.objects.get_for_id(o['content_type_id']).model_class()
            try:
                instance = klass.objects.get(pk = o['id'])
            except klass.DoesNotExist:
                continue

            result.append({'id': o['id'],
                           'content_type_id': o['content_type_id'],
                           'label': instance.get_label(),
                           'state': instance.state,
                           'available_transitions': StateManager.available_transitions(instance)})
        return result
